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
  const digits = input.replace(/\D/g, '');

  // The country code, pasted in full or left behind by clearing the field down
  // to «+380», which must read as empty rather than as three digits. Only cut
  // when there is something in front of the nine slots, or when it is ALL there
  // is — «380123456» typed alone is somebody's number, not a code with six
  // digits after it.
  const hasPrefix = digits.length > NATIONAL_LENGTH;
  if (digits.startsWith('380') && (hasPrefix || digits.length === 3)) return digits.slice(3);

  // «0XX…» — how a number is written inside the country. Cut ALWAYS, not only
  // when the nine slots overflow (2026-08-31).
  //
  // It used to need the overflow, and that made a nine-digit string beginning
  // with «0» read as a complete national number: «044123456» was kept whole,
  // the field showed «04-412-3456» with the green tick that means «finished»,
  // and the schema accepted it, because it counts nine digits and this is nine
  // digits. Saved, that is «+380044123456» — a number nobody can dial, stored
  // as valid with no error anywhere. Reproduced in a browser and read back out
  // of the database.
  //
  // Cutting it unconditionally is also just true: no Ukrainian operator code
  // begins with a zero, so a leading one is always the trunk prefix and never
  // part of the number. The same nine characters now leave eight digits, the
  // field says «8 з 9 цифр», and the wrong number cannot be saved at all.
  if (digits.startsWith('0')) return digits.slice(1, NATIONAL_LENGTH + 1);

  return digits.slice(0, NATIONAL_LENGTH);
}

/** What an empty field shows after the fixed «+380»: «__-___-____» */
export const PHONE_PLACEHOLDER = '__-___-____';

/** «441234567» → «44-123-4567» — the grouping the owner asked for (2026-08-24) */
export function formatNational(digits: string): string {
  const d = digits.slice(0, NATIONAL_LENGTH);
  return [d.slice(0, 2), d.slice(2, 5), d.slice(5, 9)].filter((p) => p.length > 0).join('-');
}

/**
 * What the FORM holds while somebody types — «+380» plus whatever digits exist.
 *
 * Deliberately not `toStoredPhone`, which returns null below nine digits. The
 * field is controlled: it renders what it last reported, so reporting null for
 * a fragment threw away every keystroke and nothing could be typed at all
 * (2026-08-24, caught on the screen). A partial is carried instead, and the
 * schema refuses it on submit — the same way a half-typed email is.
 */
export function toPhoneValue(digits: string): string {
  return digits.length > 0 ? `+380${digits}` : '';
}

/**
 * «+380441234567» → «+380 44-123-4567», for reading rather than editing.
 *
 * The column holds one canonical run of digits so nothing downstream has to
 * guess; a person reading a profile should not have to. Anything that is not
 * our own shape — there is none today, but an import could bring some — is
 * shown exactly as stored rather than reformatted into a number it might not be.
 */
export function formatPhoneDisplay(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const digits = fromStoredPhone(stored);
  if (digits.length !== NATIONAL_LENGTH) return stored;
  return `+380 ${formatNational(digits)}`;
}

/**
 * «+380441234567» → «441234567», for putting a value back in the field.
 *
 * Our own shape is read EXACTLY — «+380» then whatever follows — so a partial
 * survives the round trip the controlled field depends on. Anything else went
 * through a human or a clipboard and falls back to the tolerant parse.
 */
export function fromStoredPhone(stored: string | null | undefined): string {
  if (!stored) return '';
  if (stored.startsWith('+380'))
    return stored.slice(4).replace(/\D/g, '').slice(0, NATIONAL_LENGTH);
  return nationalDigits(stored);
}

/** Complete, or empty. A partial number is the one thing the field must refuse. */
export function isCompleteOrEmpty(digits: string): boolean {
  return digits.length === 0 || digits.length === NATIONAL_LENGTH;
}
