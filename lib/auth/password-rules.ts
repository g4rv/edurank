// What makes a password acceptable, in one place.
//
// The rules are data rather than a single regex on purpose: the same list
// validates the value AND is rendered as a live checklist while somebody types.
// A form that only says «пароль занадто простий» after a failed submit makes
// people guess at which rule they missed, and they usually guess wrong.
//
// Set by the owner 2026-08-13: at least 8 characters, one capital, one digit,
// one special character.

export interface PasswordRule {
  id: string;
  /** Shown in the checklist, so it is phrased as a requirement, not an error */
  label: string;
  test: (value: string) => boolean;
}

export const MIN_PASSWORD_LENGTH = 8;

export const PASSWORD_RULES: readonly PasswordRule[] = [
  {
    id: 'length',
    label: `Щонайменше ${MIN_PASSWORD_LENGTH} символів`,
    test: (v) => v.length >= MIN_PASSWORD_LENGTH,
  },
  {
    id: 'upper',
    // Latin AND Cyrillic: «Пароль» is a perfectly good capital letter, and a
    // rule that silently means «latin only» is one nobody can satisfy without
    // being told.
    label: 'Велика літера',
    test: (v) => /\p{Lu}/u.test(v),
  },
  {
    id: 'digit',
    label: 'Цифра',
    test: (v) => /\d/u.test(v),
  },
  {
    id: 'special',
    // Anything that is not a letter, a digit or whitespace. Listing permitted
    // characters instead would reject a keyboard we did not think of.
    label: 'Спеціальний символ (!@#$…)',
    test: (v) => /[^\p{L}\p{N}\s]/u.test(v),
  },
];

/** Which rules this value fails. Empty means it is acceptable. */
export function failedRules(value: string): PasswordRule[] {
  return PASSWORD_RULES.filter((rule) => !rule.test(value));
}

export function isStrongPassword(value: string): boolean {
  return failedRules(value).length === 0;
}

/**
 * One message naming everything still missing.
 *
 * Used where there is no room for the checklist — a server action's reply. The
 * list is joined rather than reporting only the first failure, because fixing
 * one rule and being told about the next is the loop that makes people give up
 * and use «Password1!».
 */
export function passwordProblem(value: string): string | null {
  const failed = failedRules(value);
  if (failed.length === 0) return null;
  return `Пароль має містити: ${failed.map((r) => r.label.toLowerCase()).join(', ')}`;
}
