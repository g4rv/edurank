import { looksBlocked } from './parse';

const TIMEOUT_MS = 20_000;
const PROFILE_URL = 'https://scholar.google.com/citations';

// Google answers a bare request differently from a browser's
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Accept-Language': 'en',
};

export type ScholarFetch =
  | { kind: 'ok'; html: string }
  /** No such profile, or a private one — Scholar sends both to a login page */
  | { kind: 'not_found' }
  /** Google is refusing us: wait, do not hammer */
  | { kind: 'blocked' }
  | { kind: 'error'; message: string };

/**
 * Scholar has no API and rate-limits by address, so this is slow on purpose —
 * see `gate.ts`. Redirects are NOT followed, because where one points says what
 * happened: to a login page is «no such profile», to `/sorry` is a block.
 */
export async function fetchScholarProfile(
  userId: string,
  fetchImpl: typeof fetch = fetch
): Promise<ScholarFetch> {
  let res: Response;
  try {
    res = await fetchImpl(`${PROFILE_URL}?user=${encodeURIComponent(userId)}&hl=en`, {
      headers: HEADERS,
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    return { kind: 'error', message: e instanceof Error ? e.message : 'Мережева помилка' };
  }

  if (res.status === 429) return { kind: 'blocked' };
  if (res.status === 404) return { kind: 'not_found' };
  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get('location') ?? '';
    return /\/sorry\b/i.test(location) ? { kind: 'blocked' } : { kind: 'not_found' };
  }
  if (!res.ok) return { kind: 'error', message: `Google Scholar відповів ${res.status}` };

  const html = await res.text();
  return looksBlocked(html) ? { kind: 'blocked' } : { kind: 'ok', html };
}
