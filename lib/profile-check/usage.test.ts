import { describe, expect, it } from 'vitest';
import { countingFetch, newUsage, quotaFrom } from './usage';

const answer = (headers: Record<string, string> = {}) =>
  (async () => new Response('{}', { status: 200, headers })) as typeof fetch;

describe('countingFetch', () => {
  it('counts every request, and hands the answer back untouched', async () => {
    const usage = newUsage();
    const f = countingFetch(answer(), usage);
    const res = await f('https://example.test/a');
    await f('https://example.test/b');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('{}');
    expect(usage.requests).toBe(2);
  });

  it('counts a request that fails, too — it was sent', async () => {
    const usage = newUsage();
    const down = (async () => {
      throw new Error('offline');
    }) as typeof fetch;
    await expect(countingFetch(down, usage)('https://example.test')).rejects.toThrow('offline');
    expect(usage.requests).toBe(1);
  });

  it('keeps the last quota a site reports about itself', async () => {
    const usage = newUsage();
    const headers = {
      'X-RateLimit-Limit': '5000',
      'X-RateLimit-Remaining': '4998',
      'X-RateLimit-Reset': '1794482932',
    };
    await countingFetch(answer(headers), usage)('https://example.test');
    expect(usage.quota).toEqual({
      limit: 5000,
      remaining: 4998,
      resetAt: new Date('2026-11-12T11:28:52.000Z'),
    });
    await countingFetch(answer({ ...headers, 'X-RateLimit-Remaining': '4997' }), usage)('x');
    expect(usage.quota?.remaining).toBe(4997);
  });

  it('has no quota from a site that does not say (ORCID, Google)', async () => {
    const usage = newUsage();
    await countingFetch(answer(), usage)('https://example.test');
    expect(usage.quota).toBeNull();
  });
});

describe('quotaFrom', () => {
  it('refuses headers that are not numbers rather than reporting nonsense', () => {
    const bad = new Headers({
      'x-ratelimit-limit': 'many',
      'x-ratelimit-remaining': '1',
      'x-ratelimit-reset': '2',
    });
    expect(quotaFrom(bad)).toBeNull();
    expect(quotaFrom(new Headers())).toBeNull();
  });
});
