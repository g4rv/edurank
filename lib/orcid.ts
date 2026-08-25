/**
 * ORCID — stored as the bare identifier, shown as a link.
 *
 * `Staff.orcidId` holds what a person typed and nothing more: the column is a
 * free `String?` and always has been. The profile URL is therefore never
 * stored — it is built from the identifier at render time, so the two can never
 * disagree and nobody has to keep a link and an id in step by hand.
 *
 * People paste all of it: the bare id, the id with no hyphens, the whole
 * `https://orcid.org/…` address, sometimes with a trailing slash. All of those
 * mean the same person, so they are normalised to one shape here rather than in
 * three components.
 *
 * A value that is not an ORCID at all comes back `null`, and the caller shows
 * the raw text with no link. Guessing a URL from something unrecognised would
 * send an editor to a 404 page that looks like the person's own.
 */

const ORCID_HOST = 'orcid.org';

/**
 * Sixteen characters in four groups. The last one is a checksum digit that may
 * be `X`, which is why this is not `\d{16}` — an ORCID ending in X is ordinary
 * and a digits-only test rejects one person in ten.
 */
const ORCID_RE = /^(\d{4})-?(\d{4})-?(\d{4})-?(\d{3}[\dX])$/i;

/**
 * The identifier in its canonical `0000-0002-1825-0097` form, or null if the
 * value is not an ORCID.
 */
export function normaliseOrcid(raw: string | null | undefined): string | null {
  if (!raw) return null;

  // Format only — the check digit is NOT verified here. This function decides
  // whether to render a link, and a transcription error in our own data should
  // still show the reader what is stored rather than silently dropping it.
  // `isValidOrcid` is the strict test, and it is what the forms use.
  const match = ORCID_RE.exec(core(raw));
  if (!match) return null;

  return `${match[1]}-${match[2]}-${match[3]}-${match[4]}`;
}

/** The public profile page for that identifier, or null when it is not an ORCID. */
export function orcidUrl(raw: string | null | undefined): string | null {
  const id = normaliseOrcid(raw);
  return id === null ? null : `https://${ORCID_HOST}/${id}`;
}

/**
 * The 16th character an ORCID must end in, given its first 15 digits.
 *
 * ISO 7064 MOD 11-2, the scheme ORCID itself publishes. It is what makes a
 * mistyped digit detectable rather than merely wrong: `0000-0002-1825-0097` is
 * Josiah Carberry, `0000-0002-1825-0098` is nobody, and only the checksum can
 * tell the two apart. `10` is written `X`, which is why an ORCID may end in a
 * letter.
 */
export function orcidCheckDigit(first15: string): string {
  let total = 0;
  for (const character of first15) {
    total = (total + Number(character)) * 2;
  }
  const result = (12 - (total % 11)) % 11;
  return result === 10 ? 'X' : String(result);
}

/** The identifier stripped of its address, hyphens and spaces, upper-cased. */
function core(raw: string): string {
  let value = raw
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '');
  if (value.toLowerCase().startsWith(ORCID_HOST + '/')) {
    value = value.slice(ORCID_HOST.length + 1);
  }
  return value.replace(/\/+$/, '').replace(/[\s-]/g, '').toUpperCase();
}

/** True when the value is a well-formed ORCID whose check digit agrees. */
export function isValidOrcid(raw: string | null | undefined): boolean {
  const id = normaliseOrcid(raw);
  if (id === null) return false;
  const digits = id.replace(/-/g, '');
  return orcidCheckDigit(digits.slice(0, 15)) === digits[15];
}

/**
 * What to tell somebody while they are typing.
 *
 * - `empty`    — nothing entered; the field is optional everywhere it appears
 * - `partial`  — plausible so far but too short to judge. **Never an error**:
 *                being told you are wrong halfway through typing is noise, the
 *                same rule `isbnState` follows.
 * - `valid`    — 16 characters and the check digit agrees
 * - `invalid`  — a character that cannot belong, too long, or a failed checksum
 */
export type OrcidState = 'empty' | 'partial' | 'valid' | 'invalid';

export function orcidState(raw: string): OrcidState {
  const value = core(raw);
  if (value.length === 0) return 'empty';

  // `X` is the check character and belongs in the 16th place only.
  if (!/^\d*X?$/.test(value)) return 'invalid';
  if (value.includes('X') && value.length !== 16) return 'invalid';
  if (value.length > 16) return 'invalid';
  if (value.length < 16) return 'partial';

  return orcidCheckDigit(value.slice(0, 15)) === value[15] ? 'valid' : 'invalid';
}

/** An ORCID is sixteen characters, written in four groups of four. */
export const ORCID_LENGTH = 16;

/**
 * What the person has actually entered, reduced to the characters an ORCID can
 * contain: sixteen at most, digits, and an `X` in the last place only.
 *
 * Anything else is dropped rather than reported — the same rule `TelInput`
 * follows, where a wrong character never appears at all instead of being
 * complained about later. A pasted `https://orcid.org/…` address survives it,
 * because `core` strips the address before this sees it.
 */
export function orcidDigits(raw: string): string {
  let out = '';
  for (const character of core(raw).replace(/[^0-9X]/g, '')) {
    if (out.length >= ORCID_LENGTH) break;
    // `X` is the check character. In any other position it is a typo, and
    // silently refusing it is kinder than accepting it and going red.
    if (character === 'X' && out.length !== ORCID_LENGTH - 1) continue;
    out += character;
  }
  return out;
}

/**
 * The mask: what the field shows while it is being typed.
 *
 * Hyphens are put in by the field, never typed, so an ORCID cannot be stored in
 * four different shapes and `0000000218250097` and `0000-0002-1825-0097` cannot
 * both end up in the column.
 */
export function formatOrcid(raw: string): string {
  return orcidDigits(raw).replace(/(.{4})(?=.)/g, '$1-');
}

/** How many of the 16 characters are in, ignoring hyphens — for the hint. */
export function orcidLength(raw: string): number {
  return orcidDigits(raw).length;
}
