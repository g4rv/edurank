/**
 * Counting a run's requests (owner, 2026-11-05).
 *
 * Every limit that matters here is a number of requests: ORCID allows 12 a
 * second and 25,000 a day from one address, Elsevier 5,000 a week per key, and
 * Google and Web of Science publish nothing at all and simply cut us off. So a
 * run counts what it sends — and where a site reports its own quota in the
 * answer (Elsevier's `X-RateLimit-*` headers), keeps the last figure it said.
 *
 * `countingFetch` wraps the `fetch` a checker is handed, so ORCID, Scholar and
 * Scopus are counted without any of them knowing. A browser-read site (WoS) is
 * not a `fetch`: its checker calls `count()` itself, once per page load — the
 * page's own data calls are not counted, so its figure is a floor.
 */
export interface Usage {
  requests: number;
  quota: { limit: number; remaining: number; resetAt: Date } | null;
}

export const newUsage = (): Usage => ({ requests: 0, quota: null });

/** The site's own account of its limit, from the headers of one answer, or null. */
export function quotaFrom(headers: Headers): Usage['quota'] {
  const limit = Number(headers.get('x-ratelimit-limit'));
  const remaining = Number(headers.get('x-ratelimit-remaining'));
  const reset = Number(headers.get('x-ratelimit-reset')); // epoch seconds
  if (!headers.has('x-ratelimit-remaining')) return null;
  if (![limit, remaining, reset].every(Number.isFinite) || limit <= 0) return null;
  return { limit, remaining, resetAt: new Date(reset * 1000) };
}

export function countingFetch(base: typeof fetch, usage: Usage): typeof fetch {
  return (async (...args: Parameters<typeof fetch>) => {
    usage.requests += 1;
    const res = await base(...args);
    const quota = quotaFrom(res.headers);
    if (quota) usage.quota = quota;
    return res;
  }) as typeof fetch;
}
