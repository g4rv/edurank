/**
 * A Scopus author (Elsevier Author Retrieval API, `view=ENHANCED`) → the
 * person's data. Pure: the input is one item of `author-retrieval-response`,
 * so it is tested on a saved response.
 *
 * Without entitlement Elsevier answers 200 with a «minimized metadata response»
 * — the author id and a link, nothing else — which is `minimized: true` here
 * and is reported as «the key does not give the profile», never as an empty
 * profile.
 */

type Json = Record<string, unknown>;

function obj(v: unknown): Json | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Json) : null;
}

/** The API gives one object when there is one and a list when there are several */
function list(v: unknown): unknown[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function text(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function count(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export interface ScopusProfile {
  authorId: string;
  /** The ORCID iD on the profile, canonical, or null */
  orcid: string | null;
  /** «Kamenska, I.» — the preferred name as Scopus prints it */
  name: string | null;
  /** The names of the current affiliations (usually one) */
  affiliations: string[];
  hIndex: number | null;
  documents: number | null;
  citations: number | null;
  /** Only the id came back: the key has no access to the profile */
  minimized: boolean;
}

export function parseScopusAuthor(item: unknown): ScopusProfile | null {
  const a = obj(item);
  if (!a || a['@status'] === 'not-found') return null;
  const core = obj(a.coredata) ?? {};
  const profile = obj(a['author-profile']);

  const authorId = text(core['dc:identifier']).replace(/^AUTHOR_ID:/i, '');
  if (!authorId) return null;

  const orcid = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/i.test(text(core.orcid))
    ? text(core.orcid).toUpperCase()
    : null;

  const preferred = obj(profile?.['preferred-name']);
  const surname = text(preferred?.surname);
  const given = text(preferred?.['given-name']);
  const name = surname ? (given ? `${surname}, ${given}` : surname) : null;

  // «affiliation-current» holds one affiliation or several, each with its institution
  const current = obj(profile?.['affiliation-current']);
  const affiliations = list(current?.affiliation)
    .map((x) => text(obj(obj(x)?.['ip-doc'])?.afdispname))
    .filter(Boolean);

  return {
    authorId,
    orcid,
    name,
    affiliations: [...new Set(affiliations)],
    hIndex: count(a['h-index']),
    documents: count(core['document-count']),
    citations: count(core['citation-count']),
    minimized: !profile && a['h-index'] === undefined,
  };
}
