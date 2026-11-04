/**
 * A Google Scholar profile page → the person's numbers.
 *
 * Pure, so it is tested on saved markup. The page has a table of six cells,
 * `<td class="gsc_rsb_std">`, always in this order: citations (all, last five
 * years), h-index (all, last five years), i10-index (all, last five years).
 * The labels beside them change with the page language and are NOT read — the
 * position is what stays put. If Google reshapes the table the count of cells
 * stops being six and the result is `stats: null`, which the check reports as
 * «статистику не знайдено» instead of inventing numbers.
 */

export interface AllAndRecent {
  all: number;
  recent: number;
}

export interface ScholarStats {
  citations: AllAndRecent;
  hIndex: AllAndRecent;
  i10Index: AllAndRecent;
}

export interface ScholarProfile {
  /** The name as the person wrote it on the profile */
  name: string;
  stats: ScholarStats | null;
}

const NAME_RE = /<div id="gsc_prf_in"[^>]*>([\s\S]*?)<\/div>/;
const CELL_RE = /<td class="gsc_rsb_std">([^<]*)<\/td>/g;

function decode(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/** `null` when this is not a profile page at all (no name block). */
export function parseScholarProfile(html: string): ScholarProfile | null {
  const nameMatch = NAME_RE.exec(html);
  if (!nameMatch) return null;
  const name = decode(nameMatch[1]);
  if (!name) return null;

  const cells = [...html.matchAll(CELL_RE)].map((m) => Number(m[1].replace(/\D/g, '')));
  if (cells.length !== 6 || cells.some((n) => !Number.isFinite(n))) return { name, stats: null };

  const [cAll, cRecent, hAll, hRecent, iAll, iRecent] = cells;
  return {
    name,
    stats: {
      citations: { all: cAll, recent: cRecent },
      hIndex: { all: hAll, recent: hRecent },
      i10Index: { all: iAll, recent: iRecent },
    },
  };
}

/** The profile id in a Scholar link — twelve characters, `user=` in the query. */
export function scholarUserId(link: string): string | null {
  const m = /[?&]user=([A-Za-z0-9_-]{12})(?![A-Za-z0-9_-])/.exec(link);
  return m ? m[1] : null;
}

/** A page that asks for a CAPTCHA is a block, not a profile. */
export function looksBlocked(html: string): boolean {
  return /id="captcha-form"|unusual traffic from your computer network|\/sorry\//i.test(html);
}
