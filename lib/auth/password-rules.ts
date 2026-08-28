// What makes a password acceptable, in one place.
//
// The rules are data rather than a single regex on purpose: the same list
// validates the value AND is rendered as a live checklist while somebody types
// (`components/ui/password-rules.tsx`, on the activation form and on ADMIN's
// «Встановити пароль»). A form that only says «пароль занадто простий» after a
// failed submit makes people guess at which rule they missed, and they usually
// guess wrong.
//
// Set by the owner 2026-08-13: at least 8 characters, one capital, one digit,
// one special character. Narrowed to a fixed character set on 2026-08-28.

export interface PasswordRule {
  id: string;
  /** Shown in the checklist, so it is phrased as a requirement, not an error */
  label: string;
  test: (value: string) => boolean;
}

export const MIN_PASSWORD_LENGTH = 8;

/**
 * Every symbol a password may contain — and the whole list is shown to the
 * person choosing one, which is why it has to stay short enough to read.
 *
 * **A password has to be retypeable on a different keyboard.** That is the
 * whole reason this list exists (owner, 2026-08-28). Somebody sets their
 * password on a phone — the activation link arrives by email, and email is read
 * on a phone — and then types it on a lab PC. Anything whose bytes depend on
 * the device is a lockout waiting to happen, and it surfaces as «невірний
 * пароль» with nothing to explain it.
 *
 * Deliberately absent:
 *
 * - **`'` and `"`** — iOS and Android turn these into the typographic «’» and
 *   «”». A password field suppresses that today, but ours becomes
 *   `type="text"` the moment somebody taps the eye icon.
 * - **`` ` ``, `~` and `^`** — dead keys on the Ukrainian layout and on most
 *   European ones: they wait for a second keypress and compose the next letter
 *   («â») instead of typing anything themselves.
 * - **`:` and `;`** — no defect, but they sit on one key on a Latin layout and
 *   on two different shifted digits on the Ukrainian one, and nothing is lost
 *   by leaving them out. Every symbol kept is one the reader has to scan.
 * - **everything non-ASCII**, «« »» included, which the old rule accepted.
 *
 * What survives is on the same physical key on every QWERTY-family layout and
 * on the first symbols page of both mobile keyboards.
 *
 * The letters are Latin-only for the same reason: `а е і о р с у х` in Cyrillic
 * are pixel-identical to their Latin twins, so a password mixing them cannot be
 * retyped by anyone who does not already know which is which — including its
 * owner.
 */
export const PASSWORD_SYMBOLS = '!@#$%&*()_-+=.,?';

/** `- ] ^ \` are the four that need escaping inside a character class */
const ESCAPED_SYMBOLS = PASSWORD_SYMBOLS.replace(/[\\\]^-]/g, '\\$&');
const HAS_SYMBOL = new RegExp(`[${ESCAPED_SYMBOLS}]`);
const ONLY_ALLOWED = new RegExp(`^[A-Za-z0-9${ESCAPED_SYMBOLS}]+$`);

/** «!@#$…» → «! @ # $ …», so the list is readable at a glance in the checklist */
const SYMBOL_LIST = PASSWORD_SYMBOLS.split('').join(' ');

export const PASSWORD_RULES: readonly PasswordRule[] = [
  {
    id: 'length',
    label: `Щонайменше ${MIN_PASSWORD_LENGTH} символів`,
    test: (v) => v.length >= MIN_PASSWORD_LENGTH,
  },
  {
    id: 'upper',
    label: 'Велика латинська літера',
    test: (v) => /[A-Z]/.test(v),
  },
  {
    id: 'digit',
    label: 'Цифра',
    test: (v) => /[0-9]/.test(v),
  },
  {
    // The list is spelled out rather than abbreviated to «!@#$…». The old label
    // ended in an ellipsis and the rule behind it accepted ANY non-letter, so
    // the checklist both understated what was allowed and gave no way to find
    // out (owner asked, 2026-08-28).
    id: 'special',
    label: `Спеціальний символ: ${SYMBOL_LIST}`,
    test: (v) => HAS_SYMBOL.test(v),
  },
  {
    // Last, because it is the only rule phrased as a restriction — the reader
    // has seen what IS required before being told what is not allowed.
    id: 'allowed',
    label: 'Без пробілів, кирилиці та інших символів',
    test: (v) => v.length > 0 && ONLY_ALLOWED.test(v),
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
