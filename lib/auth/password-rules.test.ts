import { describe, expect, it } from 'vitest';
import {
  MIN_PASSWORD_LENGTH,
  failedRules,
  isStrongPassword,
  passwordProblem,
  PASSWORD_RULES,
  PASSWORD_SYMBOLS,
} from './password-rules';

const ids = (value: string) => failedRules(value).map((r) => r.id);

describe('isStrongPassword', () => {
  it('accepts a password meeting every rule', () => {
    expect(isStrongPassword('Parol123!')).toBe(true);
  });

  it('rejects one that is only long', () => {
    expect(isStrongPassword('aaaaaaaaaaaa')).toBe(false);
  });

  it('rejects one that meets every rule but the length', () => {
    expect(isStrongPassword('Aa1!')).toBe(false);
    expect(ids('Aa1!')).toEqual(['length']);
  });
});

describe('failedRules — one rule at a time', () => {
  it('names the missing capital', () => {
    expect(ids('parol123!')).toEqual(['upper']);
  });

  it('names the missing digit', () => {
    expect(ids('ParolParol!')).toEqual(['digit']);
  });

  it('names the missing special character', () => {
    expect(ids('Parol12345')).toEqual(['special']);
  });

  it('names several at once', () => {
    expect(ids('parol')).toEqual(['length', 'upper', 'digit', 'special']);
  });
});

// Cyrillic was allowed until 2026-08-28 and is now refused, deliberately.
// `а е і о р с у х` are pixel-identical to their Latin twins, so a password
// mixing the two cannot be retyped by anybody — its owner included — and the
// only feedback is «невірний пароль».
describe('Cyrillic', () => {
  it('refuses a Cyrillic capital as the capital', () => {
    expect(isStrongPassword('Пароль12!')).toBe(false);
    expect(ids('Пароль12!')).toEqual(['upper', 'allowed']);
  });

  it('refuses an all-Cyrillic password however strong it looks', () => {
    expect(isStrongPassword('Кафедра2026#')).toBe(false);
  });

  it('refuses a single Cyrillic letter hidden in a Latin password', () => {
    // «о» is U+043E, not U+006F. This is the case nobody can see on screen.
    expect(ids('Parоl123!')).toEqual(['allowed']);
  });
});

describe('the allowed symbols', () => {
  it.each([...PASSWORD_SYMBOLS])('accepts %s', (char) => {
    expect(isStrongPassword(`Parol123${char}`)).toBe(true);
  });

  // The two a phone keyboard turns into «’» and «”» once the eye icon has made
  // the field `type="text"`, the three dead keys that compose the next letter
  // instead of typing themselves, and the two that move between layouts. Each
  // would set fine and then fail to be retyped.
  it.each(["'", '"', '`', '~', '^', ':', ';'])('refuses %s', (char) => {
    expect(ids(`Parol123${char}`)).toEqual(['special', 'allowed']);
  });

  it('refuses non-ASCII punctuation that used to pass', () => {
    expect(ids('Parol123«')).toEqual(['special', 'allowed']);
  });

  it('does not accept a space as the special character', () => {
    // A trailing space is almost always a paste accident, and treating it as
    // satisfying the rule would let one through that the person cannot retype.
    expect(ids('Parol123 ')).toEqual(['special', 'allowed']);
  });

  it('shows the whole list in the checklist, not an ellipsis', () => {
    const rule = PASSWORD_RULES.find((r) => r.id === 'special')!;
    for (const char of PASSWORD_SYMBOLS) expect(rule.label).toContain(char);
    expect(rule.label).not.toContain('…');
  });
});

describe('passwordProblem', () => {
  it('is null for an acceptable password', () => {
    expect(passwordProblem('Parol123!')).toBeNull();
  });

  // Reporting only the first failure is the loop that makes people give up and
  // use «Password1!» — fix one rule, get told about the next.
  it('names everything missing at once', () => {
    const message = passwordProblem('parol')!;
    expect(message).toContain('велика латинська літера');
    expect(message).toContain('цифра');
    expect(message).toContain(String(MIN_PASSWORD_LENGTH));
  });
});
