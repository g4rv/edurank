// Ukrainian mobile numbers, and nothing else.
//
// Every number this university holds is +380: `Staff.phone` was a free-text
// box, and 0 of 330 rows had anything in it (2026-08-24), so there is no legacy
// format to accommodate and no reason to accept one. The country code is fixed
// by the field rather than typed, which removes the whole class of «+38 0…» /
// «8-050…» / «(050)…» variants the кадри office would otherwise produce.

/** The 9 digits after +380 — «XXXXXXXXX» */
export const NATIONAL_LENGTH = 9;

/**
 * Any input reduced to the 9 national digits.
 *
 * Written to survive a PASTE, which is how most numbers arrive: «+38 (044)
 * 123-45-67», «0441234567» and «441234567» all mean the same nine digits, and
 * a field that rejected two of the three would be blamed on the person pasting.
 */
export function nationalDigits(input: string): string {
  let digits = input.replace(/\D/g, '');

  // A prefix is only a prefix when something is in front of the nine digits, or
  // when it is ALL there is. Exactly nine digits is already a national number
  // and is never cut into — «380123456» is somebody's number, not a country
  // code with six digits after it.
  const hasPrefix = digits.length > NATIONAL_LENGTH;

  // «380…» — the country code, pasted in full or left behind by clearing the
  // field down to «+380», which must read as empty rather than as three digits.
  if (digits.startsWith('380') && (hasPrefix || digits.length === 3)) digits = digits.slice(3);
  // «0XX…» — how a number is written inside the country
  else if (digits.startsWith('0') && hasPrefix) digits = digits.slice(1);

  return digits.slice(0, NATIONAL_LENGTH);
}

/** «441234567» → «44 123 45 67», grouped as it is read aloud */
export function formatNational(digits: string): string {
  const d = digits.slice(0, NATIONAL_LENGTH);
  const parts = [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)];
  return parts.filter((p) => p.length > 0).join(' ');
}

/**
 * What goes in the database: «+380441234567», or null for an empty field.
 *
 * One canonical form, so a future export or SMS gateway never has to guess. A
 * half-typed number stores as null rather than as a fragment — a phone number
 * that cannot be dialled is not worth keeping, and Zod reports it on submit.
 */
export function toStoredPhone(digits: string): string | null {
  return digits.length === NATIONAL_LENGTH ? `+380${digits}` : null;
}

/** «+380441234567» → «441234567», for putting a stored value back in the field */
export function fromStoredPhone(stored: string | null | undefined): string {
  return stored ? nationalDigits(stored) : '';
}

/** Complete, or empty. A partial number is the one thing the field must refuse. */
export function isCompleteOrEmpty(digits: string): boolean {
  return digits.length === 0 || digits.length === NATIONAL_LENGTH;
}
