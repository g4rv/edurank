// DOI syntax validation and normalisation.
//
// IMPORTANT — weaker than the ISBN check next door. A DOI carries NO check
// digit, so nothing here can catch a mistyped character: 10.1000/abc and
// 10.1000/abd are both perfectly well-formed. All this proves is "shaped like
// a DOI", which rules out someone pasting a journal homepage or the word
// «немає». Confirming a DOI resolves to a real paper needs Crossref/OpenAlex —
// the DOI-checker worker in the backlog.
//
// A DOI is: the prefix `10.`, a registrant number (4–9 digits), a slash, then
// an opaque suffix the publisher chooses.

const DOI_PATTERN = /^10\.\d{4,9}\/\S+$/;

// Forms people actually paste, all carrying the same DOI
const URL_PREFIXES = [
  'https://doi.org/',
  'http://doi.org/',
  'https://dx.doi.org/',
  'http://dx.doi.org/',
  'https://www.doi.org/',
  'doi:',
  'DOI:',
];

/**
 * Pulls the bare DOI out of whatever was pasted — a doi.org link, a `doi:`
 * prefix, or the DOI on its own. Case is preserved: DOIs compare
 * case-insensitively, but publishers print them mixed and rewriting would make
 * the stored value differ from the paper.
 */
export function normalizeDoi(input: string): string {
  let value = input.trim();
  for (const prefix of URL_PREFIXES) {
    if (value.toLowerCase().startsWith(prefix.toLowerCase())) {
      value = value.slice(prefix.length);
      break;
    }
  }
  return value.trim().replace(/[.,;]+$/, ''); // trailing punctuation from copy-paste
}

/** True when the input is shaped like a DOI (see the caveat at the top) */
export function isValidDoi(input: string): boolean {
  return DOI_PATTERN.test(normalizeDoi(input));
}

/** Resolver link for a DOI, so a moderator can open the paper in one click */
export function doiUrl(input: string): string {
  return `https://doi.org/${normalizeDoi(input)}`;
}

/**
 * How far along a part-typed DOI is — drives the live hint in the input.
 * `partial` covers "started correctly but not finished", so the field does not
 * go red while the user is still typing.
 */
export type DoiState = 'empty' | 'partial' | 'valid' | 'invalid';

export function doiState(input: string): DoiState {
  const doi = normalizeDoi(input);
  if (doi.length === 0) return 'empty';
  if (DOI_PATTERN.test(doi)) return 'valid';
  // Typing the prefix: "1", "10", "10.", "10.1234", "10.1234/"
  if (/^1$|^10$|^10\.$|^10\.\d{1,9}\/?$/.test(doi)) return 'partial';
  return 'invalid';
}

/**
 * Every DOI written somewhere in a piece of text — a bibliographic description
 * that ends «… https://doi.org/10.32782/2710-4656/2025.5.1/57.», a pasted link.
 * In order, without repeats, trailing punctuation dropped. A DOI is opaque
 * after its slash, so a match runs to the next space or quote.
 */
export function doisIn(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(/10\.\d{4,9}\/[^\s"'<>«»]+/g)) {
    const doi = match[0].replace(/[.,;:)\]]+$/, '');
    if (!found.some((d) => sameDoi(d, doi))) found.push(doi);
  }
  return found;
}

/** DOIs compare case-insensitively, whatever prefix was pasted with them */
export function sameDoi(a: string, b: string): boolean {
  return normalizeDoi(a).toLowerCase() === normalizeDoi(b).toLowerCase();
}

/**
 * What a DOI box should tell the person, given the rest of the form (owner,
 * 2026-10-27). A WARNING, never a refusal: a description may cite a second DOI
 * on purpose.
 *
 * - `mismatch` — the box holds a DOI, and the description or the link names a
 *   different one and NOT this one. That is how production got three articles
 *   saved with another article's DOI pasted in.
 * - `suggest` — the box is empty and the rest of the form names a DOI: offer
 *   it. The description keeps it; it is only copied.
 */
export function doiHint(
  boxValue: string,
  elsewhere: readonly string[]
): { kind: 'mismatch' | 'suggest'; doi: string } | null {
  const found = elsewhere.flatMap(doisIn);
  if (found.length === 0) return null;
  const box = normalizeDoi(boxValue);
  if (box === '') return { kind: 'suggest', doi: found[0] };
  if (!isValidDoi(box) || found.some((d) => sameDoi(d, box))) return null;
  return { kind: 'mismatch', doi: found[0] };
}
