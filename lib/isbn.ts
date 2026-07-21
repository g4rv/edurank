// ISBN check-digit validation.
//
// What this proves: the number is well formed. The last character of an ISBN is
// computed from the others, so the arithmetic below catches the mistakes people
// actually make — a mistyped digit, or two digits swapped.
//
// What it does NOT prove: that the book exists. An invented number that happens
// to satisfy the checksum passes. Confirming existence needs an external lookup
// (OpenLibrary / Google Books), the same shape as the planned DOI checker.

/** Strips hyphens, spaces and any other separators; uppercases the ISBN-10 `X` */
export function normalizeIsbn(input: string): string {
  return input.toUpperCase().replace(/[^0-9X]/g, '');
}

/** Digit value; the ISBN-10 check character `X` means ten */
function charValue(c: string): number {
  return c === 'X' ? 10 : c.charCodeAt(0) - 48;
}

// Weights alternate 1,3,1,3…; a correct ISBN-13 sums to a multiple of 10
function isValidIsbn13(digits: string): boolean {
  // Book EANs are the 978 and 979 prefixes; anything else is not an ISBN
  if (!digits.startsWith('978') && !digits.startsWith('979')) return false;
  if (digits.includes('X')) return false; // X is an ISBN-10-only check character

  let sum = 0;
  for (let i = 0; i < 13; i++) sum += charValue(digits[i]) * (i % 2 === 0 ? 1 : 3);
  return sum % 10 === 0;
}

// Weights count down 10,9,8…1; a correct ISBN-10 sums to a multiple of 11
function isValidIsbn10(digits: string): boolean {
  // Only the final check character may be X
  if (digits.slice(0, 9).includes('X')) return false;

  let sum = 0;
  for (let i = 0; i < 10; i++) sum += charValue(digits[i]) * (10 - i);
  return sum % 11 === 0;
}

/** True when the input is a well-formed ISBN-10 or ISBN-13 (separators ignored) */
export function isValidIsbn(input: string): boolean {
  const digits = normalizeIsbn(input);
  if (digits.length === 10) return isValidIsbn10(digits);
  if (digits.length === 13) return isValidIsbn13(digits);
  return false;
}

/**
 * How far along a part-typed ISBN is — drives the live hint in the input.
 * `empty` while nothing is entered, `valid` once the checksum passes,
 * `partial` while it is still too short, `invalid` otherwise.
 */
export type IsbnState = 'empty' | 'partial' | 'valid' | 'invalid';

export function isbnState(input: string): IsbnState {
  const digits = normalizeIsbn(input);
  if (digits.length === 0) return 'empty';
  if (isValidIsbn(digits)) return 'valid';
  if (digits.length < 10 || (digits.length > 10 && digits.length < 13)) return 'partial';
  return 'invalid';
}
