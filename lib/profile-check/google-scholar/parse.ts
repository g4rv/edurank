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

export interface ScholarArticle {
  title: string;
  /** null when Scholar shows no year for it */
  year: number | null;
}

export interface ScholarProfile {
  /** The name as the person wrote it on the profile — «Name (ORCID …)» */
  name: string;
  /**
   * The description line under the name — the affiliation, which Scholar calls
   * «Affiliation» in the editor — or null when the person left it empty.
   */
  affiliation: string | null;
  /** The first page of articles, newest first (the fetch asks `sortby=pubdate`) */
  articles: ScholarArticle[];
  stats: ScholarStats | null;
  /**
   * The domain of the verified email — «Verified email at uhsp.edu.ua» — or null
   * for «No verified email». Read as the first domain in that line, so it does
   * not depend on the page language.
   */
  verifiedDomain: string | null;
  /** The «Homepage» link next to the verified email, or null */
  homepage: string | null;
  /** The profile's interests, one per keyword */
  keywords: string[];
}

const NAME_RE = /<div id="gsc_prf_in"[^>]*>([\s\S]*?)<\/div>/;
const CELL_RE = /<td class="gsc_rsb_std">([^<]*)<\/td>/g;
// The description is the first `gsc_prf_il` WITHOUT an id: the others (the
// verified email, the interests) carry one
const AFFILIATION_RE = /<div class="gsc_prf_il">([\s\S]*?)<\/div>/;
const ROW_RE = /<tr class="gsc_a_tr">([\s\S]*?)<\/tr>/g;
const TITLE_RE = /class="gsc_a_at"[^>]*>([\s\S]*?)<\/a>/;
const YEAR_RE = /<td class="gsc_a_y">[\s\S]*?<span[^>]*>([^<]*)<\/span>/;
// «Verified email at uhsp.edu.ua - Homepage»: the line has its own id, and the
// link inside it is the homepage
const VERIFIED_RE = /<div[^>]*id="gsc_prf_ivh"[^>]*>([\s\S]*?)<\/div>/;
const HOMEPAGE_RE = /<a[^>]*href="([^"]+)"[^>]*>/;
const DOMAIN_RE = /([a-z0-9-]+(?:\.[a-z0-9-]+)+)/i;
// The interests: every link inside the block that holds them — the block's id is
// what scraping guides agree on; the class of each link (`gsc_prf_inta`) is not
// relied on, so a renamed class does not empty everybody's keywords
const INTERESTS_RE = /<div[^>]*id="gsc_prf_int"[^>]*>([\s\S]*?)<\/div>/;
const INTEREST_RE = /<a\b[^>]*>([\s\S]*?)<\/a>/g;

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

  const affMatch = AFFILIATION_RE.exec(html);
  const affiliation = affMatch ? decode(affMatch[1]) || null : null;

  const articles: ScholarArticle[] = [...html.matchAll(ROW_RE)].map((m) => {
    const year = Number.parseInt(YEAR_RE.exec(m[1])?.[1] ?? '', 10);
    return {
      title: decode(TITLE_RE.exec(m[1])?.[1] ?? ''),
      year: Number.isNaN(year) ? null : year,
    };
  });

  const verifiedBlock = VERIFIED_RE.exec(html)?.[1] ?? '';
  // The text outside the link: «Verified email at uhsp.edu.ua - »
  const verifiedText = decode(verifiedBlock.replace(/<a[\s\S]*?<\/a>/g, ' '));
  const verifiedDomain = DOMAIN_RE.exec(verifiedText)?.[1].toLowerCase() ?? null;
  const homepageRaw = HOMEPAGE_RE.exec(verifiedBlock)?.[1] ?? null;
  const homepage = homepageRaw ? decode(homepageRaw) || null : null;
  const keywords = [...(INTERESTS_RE.exec(html)?.[1] ?? '').matchAll(INTEREST_RE)]
    .map((m) => decode(m[1]))
    .filter(Boolean);
  const extras = { verifiedDomain, homepage, keywords };

  const cells = [...html.matchAll(CELL_RE)].map((m) => Number(m[1].replace(/\D/g, '')));
  if (cells.length !== 6 || cells.some((n) => !Number.isFinite(n))) {
    return { name, affiliation, articles, stats: null, ...extras };
  }

  const [cAll, cRecent, hAll, hRecent, iAll, iRecent] = cells;
  return {
    name,
    affiliation,
    articles,
    ...extras,
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
