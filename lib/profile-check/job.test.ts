import { describe, expect, it, vi } from 'vitest';
import { executeRun, startRun, STALE_MS } from './job';

vi.mock('@/lib/profile-check/people', () => ({
  listPeopleToCheck: vi.fn(async () => [
    { staffId: 's1', name: 'A', faculty: null, department: null, links: { orcid: 'x' } },
  ]),
}));

type Where = { status: string; platform: string; heartbeatAt: { gt: Date } };

function client(live: boolean) {
  return {
    profileCheckRun: {
      findFirst: vi.fn(async (_args: { where: Where }) => (live ? { id: 'r0' } : null)),
      updateMany: vi.fn(async (_args: { data: { status: string } }) => ({ count: 1 })),
      create: vi.fn(async (_args: { data: unknown }) => ({ id: 'r1' })),
    },
  };
}

describe('startRun', () => {
  it('refuses while another run is still beating', async () => {
    const c = client(true);
    const r = await startRun(c as never, 'u1', 'orcid');
    expect(r).toEqual({ ok: false, reason: 'running' });
    expect(c.profileCheckRun.create).not.toHaveBeenCalled();
  });

  it('looks for liveness by the heartbeat, not by status alone', async () => {
    const c = client(false);
    await startRun(c as never, 'u1', 'orcid');
    const where = c.profileCheckRun.findFirst.mock.calls[0][0].where;
    expect(where.status).toBe('RUNNING');
    expect(where.platform).toBe('orcid'); // another platform's run does not block this one
    expect(Date.now() - where.heartbeatAt.gt.getTime()).toBeGreaterThanOrEqual(STALE_MS - 50);
  });

  it('buries a dead run before starting and records who started the new one', async () => {
    const c = client(false);
    const r = await startRun(c as never, 'u1', 'orcid');
    expect(c.profileCheckRun.updateMany.mock.calls[0][0].data.status).toBe('FAILED');
    expect(c.profileCheckRun.create.mock.calls[0][0].data).toEqual({
      platform: 'orcid',
      total: 1,
      startedById: 'u1',
    });
    expect(r).toMatchObject({ ok: true, runId: 'r1' });
  });
});

describe('startRun, only those not yet checked', () => {
  /** The fake client plus the stored rows a `findMany` over ProfileCheck returns */
  function withStored(stored: { staffId: string; status: string }[]) {
    const c = client(false);
    const findMany = vi.fn(async (_args: unknown) => stored);
    return { c: { ...c, profileCheck: { findMany } }, findMany };
  }

  it('skips someone who already has an answer, and starts no run', async () => {
    const { c } = withStored([{ staffId: 's1', status: 'ok' }]);
    const r = await startRun(c as never, 'u1', 'orcid', { onlyMissing: true });
    expect(r).toEqual({ ok: false, reason: 'nothing_new' });
    expect(c.profileCheckRun.create).not.toHaveBeenCalled();
  });

  it('takes someone never checked, and someone whose last attempt failed', async () => {
    for (const stored of [[], [{ staffId: 's1', status: 'failed' }]]) {
      const { c } = withStored(stored);
      const r = await startRun(c as never, 'u1', 'orcid', { onlyMissing: true });
      expect(r).toMatchObject({ ok: true });
    }
  });

  it('with «everyone» never reads the stored rows', async () => {
    const { c, findMany } = withStored([{ staffId: 's1', status: 'ok' }]);
    const r = await startRun(c as never, 'u1', 'orcid', {});
    expect(r).toMatchObject({ ok: true });
    expect(findMany).not.toHaveBeenCalled();
  });
});

describe('executeRun', () => {
  const people = ['a', 'b', 'c'].map((id) => ({
    staffId: id,
    name: id,
    faculty: null,
    department: null,
    links: { scopus: `https://www.scopus.com/authid/detail.uri?authorId=${id}` },
  }));
  const checkers = {
    scopus: {
      platform: 'scopus' as const,
      implemented: true,
      check: vi.fn(async (link: string) => ({
        platform: 'scopus' as const,
        link,
        status: 'ok' as const,
        checks: [],
      })),
    },
  };

  function runClient(failProgress: boolean) {
    const upserts: string[] = [];
    const update = vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      // The progress write carries `done`; the closing one carries `status`
      if (failProgress && 'done' in data) throw new Error('Unknown argument `failed`');
      return data;
    });
    return {
      upserts,
      update,
      client: {
        $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
        profileCheck: {
          findMany: async () => [],
          upsert: async (a: { create: { staffId: string } }) => {
            upserts.push(a.create.staffId);
            return a;
          },
        },
        profileCheckRun: { update },
      },
    };
  }

  it('checks everyone and ends as done even when the progress cannot be written', async () => {
    const { client, upserts, update } = runClient(true);
    await executeRun(client as never, 'r1', people, 'scopus', { checkers });
    expect(upserts.sort()).toEqual(['a', 'b', 'c']);
    const last = update.mock.calls.at(-1)?.[0].data as { status?: string };
    expect(last.status).toBe('DONE');
  });

  it('counts a failed attempt on the run', async () => {
    const { client, update } = runClient(false);
    const failing = {
      scopus: {
        ...checkers.scopus,
        check: async (link: string) => ({
          platform: 'scopus' as const,
          link,
          status: 'failed' as const,
          error: 'blocked',
          checks: [],
        }),
      },
    };
    await executeRun(client as never, 'r1', people, 'scopus', { checkers: failing });
    const progress = update.mock.calls
      .map((c) => c[0].data as { done?: number; failed?: number })
      .filter((d) => d.done !== undefined);
    expect(progress.at(-1)).toMatchObject({ done: 3, failed: 3 });
  });
});

describe('startRun, a minute between runs', () => {
  /** Answers the liveness query (RUNNING) with nothing, and the cooldown query with `last` */
  function afterRun(last: { finishedAt: Date } | null) {
    const findFirst = vi.fn(async (args: { where: { status?: string } }) =>
      args.where.status === 'RUNNING' ? null : last
    );
    return {
      findFirst,
      client: {
        profileCheckRun: {
          findFirst,
          updateMany: vi.fn(async () => ({ count: 0 })),
          create: vi.fn(async () => ({ id: 'r2' })),
        },
      },
    };
  }

  it('refuses a run that follows another of the same platform within the minute', async () => {
    const { client } = afterRun({ finishedAt: new Date(Date.now() - 20_000) });
    const r = await startRun(client as never, 'u1', 'googleScholar');
    expect(r).toMatchObject({ ok: false, reason: 'cooling' });
    if (!r.ok && r.reason === 'cooling') {
      expect(r.secondsLeft).toBeGreaterThan(30);
      expect(r.secondsLeft).toBeLessThanOrEqual(40);
    }
    expect(client.profileCheckRun.create).not.toHaveBeenCalled();
  });

  it('allows it once the minute has passed', async () => {
    const { client } = afterRun({ finishedAt: new Date(Date.now() - 61_000) });
    expect(await startRun(client as never, 'u1', 'googleScholar')).toMatchObject({ ok: true });
  });

  it('allows the first run ever', async () => {
    const { client } = afterRun(null);
    expect(await startRun(client as never, 'u1', 'googleScholar')).toMatchObject({ ok: true });
  });

  it('asks about the SAME platform only: another site’s pause is not this one’s', async () => {
    const { client, findFirst } = afterRun(null);
    await startRun(client as never, 'u1', 'wos');
    const cooldownQuery = findFirst.mock.calls[1][0] as unknown as { where: { platform: string } };
    expect(cooldownQuery.where.platform).toBe('wos');
  });
});

describe('executeRun, counting requests', () => {
  const people = ['a', 'b', 'c'].map((id) => ({
    staffId: id,
    name: id,
    faculty: null,
    department: null,
    links: { scopus: `https://www.scopus.com/authid/detail.uri?authorId=${id}` },
  }));

  /** A checker that makes `calls` requests per person through the fetch it is handed */
  const checkerMaking = (calls: number) => ({
    scopus: {
      platform: 'scopus' as const,
      implemented: true,
      check: async (link: string, ctx: { fetchImpl: typeof fetch; countRequest?: () => void }) => {
        for (let i = 0; i < calls; i++) await ctx.fetchImpl('https://api.example.test/x');
        return { platform: 'scopus' as const, link, status: 'ok' as const, checks: [] };
      },
    },
  });

  function recorder() {
    const updates: Record<string, unknown>[] = [];
    return {
      updates,
      client: {
        $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
        profileCheck: { findMany: async () => [], upsert: async (a: unknown) => a },
        profileCheckRun: {
          update: async ({ data }: { data: Record<string, unknown> }) => {
            updates.push(data);
            return data;
          },
        },
      },
    };
  }

  const answers = (headers: Record<string, string> = {}) =>
    (async () => new Response('{}', { status: 200, headers })) as typeof fetch;

  it('saves how many requests the run sent', async () => {
    const { client, updates } = recorder();
    await executeRun(client as never, 'r1', people, 'scopus', {
      checkers: checkerMaking(3) as never,
      fetchImpl: answers(),
    });
    const last = updates.filter((u) => 'requests' in u).at(-1);
    expect(last?.requests).toBe(9); // 3 people × 3 requests
    expect(last).not.toHaveProperty('quotaLimit'); // ORCID, Google: nothing to report
  });

  it('saves the quota a site reports about itself', async () => {
    const { client, updates } = recorder();
    await executeRun(client as never, 'r1', people, 'scopus', {
      checkers: checkerMaking(1) as never,
      fetchImpl: answers({
        'X-RateLimit-Limit': '5000',
        'X-RateLimit-Remaining': '4990',
        'X-RateLimit-Reset': '1794482932',
      }),
    });
    const last = updates.filter((u) => 'quotaLimit' in u).at(-1);
    expect(last).toMatchObject({ requests: 3, quotaLimit: 5000, quotaRemaining: 4990 });
    expect(last?.quotaResetAt).toEqual(new Date('2026-11-12T11:28:52.000Z'));
  });

  it('counts a browser-read page, which does not go through fetch', async () => {
    const { client, updates } = recorder();
    const browserChecker = {
      scopus: {
        platform: 'scopus' as const,
        implemented: true,
        check: async (link: string, ctx: { countRequest?: () => void }) => {
          ctx.countRequest?.();
          return { platform: 'scopus' as const, link, status: 'ok' as const, checks: [] };
        },
      },
    };
    await executeRun(client as never, 'r1', people, 'scopus', {
      checkers: browserChecker as never,
      fetchImpl: answers(),
    });
    expect(updates.filter((u) => 'requests' in u).at(-1)?.requests).toBe(3);
  });

  it('still ends the run as done when the figures cannot be written', async () => {
    const closing: Record<string, unknown>[] = [];
    const client = {
      $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
      profileCheck: { findMany: async () => [], upsert: async (a: unknown) => a },
      profileCheckRun: {
        update: async ({ data }: { data: Record<string, unknown> }) => {
          if ('requests' in data) throw new Error('Unknown argument `requests`');
          closing.push(data);
          return data;
        },
      },
    };
    await executeRun(client as never, 'r1', people, 'scopus', {
      checkers: checkerMaking(1) as never,
      fetchImpl: answers(),
    });
    expect(closing.at(-1)).toMatchObject({ status: 'DONE' });
  });
});
