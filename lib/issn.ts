// ISSN check-digit validation — the journal's number, `1234-567X`.
//
// What this proves: the number is well formed. The eighth character is computed
// from the first seven (weights 8…2, modulo 11, `X` for ten), so a mistyped or
// swapped digit is caught. What it does NOT prove: that the journal exists, or
// that it is peer-reviewed — that is what the publisher's page is asked for.

/** Digits only, plus the check character `X`, uppercased */
export function normalizeIssn(input: string): string {
  return input.toUpperCase().replace(/[^0-9X]/g, '');
}

/** True when the input is a well-formed ISSN (the hyphen is optional) */
export function isValidIssn(input: string): boolean {
  const d = normalizeIssn(input);
  if (!/^\d{7}[\dX]$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 7; i++) sum += (d.charCodeAt(i) - 48) * (8 - i);
  const check = (11 - (sum % 11)) % 11;
  return d[7] === (check === 10 ? 'X' : String(check));
}

/**
 * What the box lets through while somebody types: seven digits, then a digit or
 * `X`, with the hyphen put in by the mask. The mask is ENFORCED, like the ISBN,
 * ORCID and phone boxes — never a drawn hint.
 */
export function formatIssn(input: string): string {
  const raw = input.toUpperCase().replace(/[^0-9X]/g, '');
  // `X` is only ever the eighth character
  let d = '';
  for (const c of raw) {
    if (d.length >= 8) break;
    if (c === 'X' && d.length !== 7) continue;
    d += c;
  }
  return d.length > 4 ? `${d.slice(0, 4)}-${d.slice(4)}` : d;
}

export type IssnState = 'empty' | 'partial' | 'valid' | 'invalid';

export function issnState(input: string): IssnState {
  const d = normalizeIssn(input);
  if (d.length === 0) return 'empty';
  if (d.length < 8) return 'partial';
  return isValidIssn(d) ? 'valid' : 'invalid';
}
