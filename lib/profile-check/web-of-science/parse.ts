/**
 * A Web of Science researcher profile → the person's data.
 *
 * Pure, so it is tested on saved text. The page is rendered by JavaScript, so
 * the input is what a browser shows: the name from `h1.wat-author-name` and
 * the page's visible text (`innerText`, one line per block). The profile reads,
 * top to bottom: the name, the affiliation under it («University of X»
 * followed directly by the country), «Identifiers» (ResearcherID and ORCID),
 * «Published names», «Organization», then the metrics, where the number stands
 * on the line BEFORE its «H-Index» label.
 *
 * If a section is missing its fields are null and the checks say so; nothing
 * is guessed.
 */

export interface WosProfile {
  name: string;
  /** The line under the name: the organisation with its country stuck to it */
  affiliation: string | null;
  /** Web of Science ResearcherID, e.g. `HGB-1335-2022` */
  researcherId: string | null;
  /** The ORCID iD on the profile, canonical */
  orcid: string | null;
  publishedNames: string[];
  organization: string | null;
  /** Core Collection h-index */
  hIndex: number | null;
  /** «Subject Categories»: Business & Economics, Education & Educational Research… */
  subjectCategories: string[];
}

const SECTION_LABELS = ['Identifiers', 'Published names', 'Organization', 'Subject Categories'];

/** The profile's section headings stand alone on a line */
function indexOfLabel(lines: string[], label: string): number {
  return lines.findIndex((l) => l.toLowerCase() === label.toLowerCase());
}

/** The lines after `label` up to the next known heading (exclusive). */
function sectionAfter(lines: string[], label: string): string[] {
  const start = indexOfLabel(lines, label);
  if (start === -1) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) =>
    SECTION_LABELS.some((s) => s.toLowerCase() === l.toLowerCase())
  );
  return end === -1 ? rest : rest.slice(0, end);
}

/**
 * `categories` are read from the page's own structure — one chip each — because
 * the visible text runs them together on one line («Business & Economics
 * Education & Educational Research») with no mark to split on. Without them the
 * list is empty rather than a guess.
 */
export function parseWosProfile({
  name,
  text,
  categories = [],
}: {
  name: string;
  text: string;
  categories?: string[];
}): WosProfile | null {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const lines = text
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const nameAt = lines.indexOf(trimmed);
  const under = nameAt === -1 ? undefined : lines[nameAt + 1];
  const affiliation =
    under && !SECTION_LABELS.some((s) => s.toLowerCase() === under.toLowerCase()) ? under : null;

  const identifiers = sectionAfter(lines, 'Identifiers').join(' ');
  const rid =
    /ResearcherID\s*([A-Za-z0-9]{1,3}-\d{4}-\d{4}|\d{5,})/i.exec(identifiers)?.[1] ?? null;
  const orcid = /orcid\.org\/(\d{4}-\d{4}-\d{4}-\d{3}[\dX])/i.exec(identifiers)?.[1] ?? null;

  const orgLines = sectionAfter(lines, 'Organization');

  // «2», then «H-Index» on the next line
  const hAt = lines.findIndex((l) => /^h-index$/i.test(l));
  const hRaw = hAt > 0 ? lines[hAt - 1] : '';
  const hIndex = /^\d+$/.test(hRaw) ? Number(hRaw) : null;

  return {
    name: trimmed,
    affiliation,
    researcherId: rid ? rid.toUpperCase() : null,
    orcid: orcid ? orcid.toUpperCase() : null,
    publishedNames: sectionAfter(lines, 'Published names'),
    organization: orgLines[0] ?? null,
    hIndex,
    subjectCategories: categories.map((c) => c.replace(/\s+/g, ' ').trim()).filter(Boolean),
  };
}

/**
 * The record id in a Web of Science link — the part after `author/record/`.
 * It is a ResearcherID (`HGB-1335-2022`) or a numeric author record
 * (`30747601`). The old `researcherid.com/rid/…` form carries a ResearcherID.
 */
export function wosRecordId(link: string): string | null {
  const record = /author\/record\/([A-Za-z0-9-]+)/i.exec(link)?.[1];
  if (record) return record.toUpperCase();
  return /researcherid\.com\/rid\/([A-Za-z0-9-]+)/i.exec(link)?.[1]?.toUpperCase() ?? null;
}

/** A ResearcherID has letters, a year and a number; a numeric record id has not. */
export function isResearcherId(id: string): boolean {
  return /^[A-Z0-9]{1,3}-\d{4}-\d{4}$/i.test(id);
}
