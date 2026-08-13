import { describe, expect, it } from 'vitest';
import {
  MIN_PASSWORD_LENGTH,
  failedRules,
  isStrongPassword,
  passwordProblem,
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

// The university writes in Ukrainian and people will choose Ukrainian
// passwords. A rule that quietly means «latin only» is one nobody can satisfy
// without being told why.
describe('Cyrillic', () => {
  it('counts a Cyrillic capital as a capital', () => {
    expect(isStrongPassword('Пароль12!')).toBe(true);
  });

  it('does not count a Cyrillic letter as a special character', () => {
    expect(ids('Пароль123')).toEqual(['special']);
  });

  it('accepts an all-Cyrillic password with a digit and a symbol', () => {
    expect(isStrongPassword('Кафедра2026#')).toBe(true);
  });
});

describe('the special-character rule', () => {
  it.each(['!', '@', '#', '$', '%', '^', '&', '*', '_', '-', '+', '=', '?', '.', ',', '«'])(
    'accepts %s',
    (char) => {
      expect(isStrongPassword(`Parol123${char}`)).toBe(true);
    }
  );

  it('does not accept a space as the special character', () => {
    // A trailing space is almost always a paste accident, and treating it as
    // satisfying the rule would let one through that the person cannot retype.
    expect(ids('Parol123 ')).toEqual(['special']);
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
    expect(message).toContain('велика літера');
    expect(message).toContain('цифра');
    expect(message).toContain(String(MIN_PASSWORD_LENGTH));
  });
});
