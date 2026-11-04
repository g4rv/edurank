import { normaliseOrcid } from '@/lib/orcid';

const API_BASE = 'https://pub.orcid.org/v3.0';
const TIMEOUT_MS = 15_000;
const HEADERS = { Accept: 'application/json' };

export class OrcidFetchError extends Error {}

async function get(url: string, fetchImpl: typeof fetch): Promise<Response> {
  // One retry on 429 / 5xx: the public API is rate limited and now and then flaky
  let last: Response | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetchImpl(url, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.status !== 429 && res.status < 500) return res;
    last = res;
    if (attempt === 0) await new Promise((r) => setTimeout(r, 1500));
  }
  return last!;
}

/**
 * The public record of one ORCID iD, with its external identifiers.
 *
 * `/record` often returns empty external-ids, so the dedicated endpoint is
 * asked as well (as the Python tool did). A failure of that second request
 * costs only the IDs, never the whole check.
 */
export async function fetchOrcidRecord(
  orcid: string,
  fetchImpl: typeof fetch = fetch
): Promise<unknown> {
  const id = normaliseOrcid(orcid);
  if (!id) throw new OrcidFetchError('Це не ORCID iD');

  let res: Response;
  try {
    res = await get(`${API_BASE}/${id}/record`, fetchImpl);
  } catch (e) {
    throw new OrcidFetchError(e instanceof Error ? e.message : 'Мережева помилка');
  }
  if (res.status === 404) throw new OrcidFetchError('Профіль ORCID не знайдено');
  if (!res.ok) throw new OrcidFetchError(`ORCID відповів ${res.status}`);
  const record = (await res.json()) as Record<string, unknown>;

  try {
    const ext = await get(`${API_BASE}/${id}/external-identifiers`, fetchImpl);
    if (ext.ok) {
      const person = (record.person ?? (record.person = {})) as Record<string, unknown>;
      const have = (person['external-ids'] as { 'external-identifier'?: unknown[] } | undefined)?.[
        'external-identifier'
      ];
      if (!have || !have.length) person['external-ids'] = await ext.json();
    }
  } catch {
    // the IDs are an extra; the record stands without them
  }
  return record;
}
