/**
 * The Elsevier Author Retrieval API for one Scopus author.
 *
 * `GET api.elsevier.com/content/author/author_id/<id>?view=ENHANCED` with the
 * key in `X-ELS-APIKey`. This is Elsevier's documented API, not a page: a key
 * (free, non-commercial) is what scopus.com itself would not give a script.
 * The key allows 5,000 requests a week and 3 a second; a run of the whole
 * staff is about 135.
 *
 * Every outcome is a value, none is thrown, so one bad answer never stops a run.
 */
const BASE = 'https://api.elsevier.com/content/author/author_id/';
const TIMEOUT_MS = 20_000;

export type ScopusFetch =
  | { kind: 'ok'; item: unknown }
  | { kind: 'not_found' }
  /** The key is refused: wrong, revoked, or without access to this resource */
  | { kind: 'unauthorized' }
  /** The key's quota or rate is used up: wait */
  | { kind: 'limited' }
  | { kind: 'error'; message: string };

export async function fetchScopusAuthor(
  authorId: string,
  key: string,
  fetchImpl: typeof fetch = fetch
): Promise<ScopusFetch> {
  let res: Response;
  try {
    res = await fetchImpl(`${BASE}${encodeURIComponent(authorId)}?view=ENHANCED`, {
      headers: { 'X-ELS-APIKey': key, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    return { kind: 'error', message: e instanceof Error ? e.message : 'Мережева помилка' };
  }

  if (res.status === 401 || res.status === 403) return { kind: 'unauthorized' };
  if (res.status === 404) return { kind: 'not_found' };
  if (res.status === 429) return { kind: 'limited' };
  if (!res.ok) return { kind: 'error', message: `Elsevier відповів ${res.status}` };

  try {
    const json = (await res.json()) as { 'author-retrieval-response'?: unknown };
    const first = [json['author-retrieval-response']].flat()[0];
    return first ? { kind: 'ok', item: first } : { kind: 'not_found' };
  } catch {
    return { kind: 'error', message: 'Elsevier відповів не JSON' };
  }
}
