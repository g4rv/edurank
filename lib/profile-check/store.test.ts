import { describe, expect, it, vi } from 'vitest';
import { saveResult } from './store';
import type { PersonResult, PlatformResult } from './types';

type Row = { platform: string; status: string };

/** A client whose `findMany` answers like the database would for the stored rows */
function client(stored: Row[]) {
  const upsert = vi.fn(async (args: unknown) => args);
  const findMany = vi.fn(async ({ where }: { where: { platform: { in: string[] } } }) =>
    stored
      .filter((r) => where.platform.in.includes(r.platform) && r.status !== 'failed')
      .map((r) => ({ platform: r.platform }))
  );
  return {
    upsert,
    findMany,
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    profileCheck: { upsert, findMany },
  };
}

const platform = (
  name: PlatformResult['platform'],
  status: PlatformResult['status']
): PlatformResult => ({
  platform: name,
  link: 'x',
  status,
  checks: [],
  checkedAt: '2026-11-05T10:00:00.000Z',
});
const result = (...platforms: PlatformResult[]): PersonResult => ({
  staffId: 's1',
  name: 'x',
  faculty: null,
  department: null,
  platforms,
});
const written = (c: ReturnType<typeof client>) =>
  c.upsert.mock.calls.map((a) => (a[0] as { create: { platform: string } }).create.platform);

describe('saveResult', () => {
  it('keeps a real result when the new attempt failed — the Google block must not wipe the data', async () => {
    const c = client([{ platform: 'googleScholar', status: 'ok' }]);
    const r = await saveResult(c as never, result(platform('googleScholar', 'failed')));
    expect(written(c)).toEqual([]);
    expect(r.kept).toEqual(['googleScholar']);
  });

  it('keeps a stored error too: it is an answer, and a failure says nothing about the profile', async () => {
    const c = client([{ platform: 'googleScholar', status: 'error' }]);
    const r = await saveResult(c as never, result(platform('googleScholar', 'failed')));
    expect(written(c)).toEqual([]);
    expect(r.kept).toEqual(['googleScholar']);
  });

  it('writes the failure when nothing was stored, so the page can show it', async () => {
    const c = client([]);
    const r = await saveResult(c as never, result(platform('googleScholar', 'failed')));
    expect(written(c)).toEqual(['googleScholar']);
    expect(r.kept).toEqual([]);
  });

  it('writes a failure over an earlier failure — there is no answer to protect', async () => {
    const c = client([{ platform: 'googleScholar', status: 'failed' }]);
    await saveResult(c as never, result(platform('googleScholar', 'failed')));
    expect(written(c)).toEqual(['googleScholar']);
  });

  it('replaces a stored answer with a new answer, even a worse one: the profile changed', async () => {
    const c = client([{ platform: 'googleScholar', status: 'ok' }]);
    await saveResult(c as never, result(platform('googleScholar', 'error')));
    expect(written(c)).toEqual(['googleScholar']);
  });

  it('judges each platform on its own', async () => {
    const c = client([{ platform: 'googleScholar', status: 'ok' }]);
    const r = await saveResult(
      c as never,
      result(platform('orcid', 'ok'), platform('googleScholar', 'failed'))
    );
    expect(written(c)).toEqual(['orcid']);
    expect(r.kept).toEqual(['googleScholar']);
  });

  it('does not even look at the stored rows when nothing failed', async () => {
    const c = client([]);
    await saveResult(c as never, result(platform('orcid', 'ok')));
    expect(c.findMany).not.toHaveBeenCalled();
  });
});
