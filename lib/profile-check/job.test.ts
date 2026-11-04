import { describe, expect, it, vi } from 'vitest';
import { startRun, STALE_MS } from './job';

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
