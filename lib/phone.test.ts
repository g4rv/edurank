import { describe, expect, it } from 'vitest';
import {
  formatNational,
  fromStoredPhone,
  isCompleteOrEmpty,
  nationalDigits,
  toStoredPhone,
} from './phone';

describe('nationalDigits', () => {
  it('keeps nine digits typed on their own', () => {
    expect(nationalDigits('441234567')).toBe('441234567');
  });

  // The three ways a Ukrainian number is written down, all meaning the same one
  it('strips the country code however it was pasted', () => {
    expect(nationalDigits('+380441234567')).toBe('441234567');
    expect(nationalDigits('380441234567')).toBe('441234567');
    expect(nationalDigits('+38 (044) 123-45-67')).toBe('441234567');
  });

  it('strips the national trunk zero', () => {
    expect(nationalDigits('0441234567')).toBe('441234567');
    expect(nationalDigits('(044) 123 45 67')).toBe('441234567');
  });

  it('throws away letters, spaces and punctuation', () => {
    expect(nationalDigits('тел. 044-123-45-67')).toBe('441234567');
  });

  it('never returns more than nine', () => {
    expect(nationalDigits('4412345671234')).toHaveLength(9);
  });

  it('is empty for an empty field', () => {
    expect(nationalDigits('')).toBe('');
    expect(nationalDigits('+380')).toBe('');
  });

  // «44» starts with no trunk zero and is shorter than nine — stripping here
  // would eat a digit the person is still typing
  it('leaves a half-typed number alone', () => {
    expect(nationalDigits('44')).toBe('44');
    expect(nationalDigits('0')).toBe('0');
  });
});

describe('formatNational', () => {
  it('groups the way the number is read aloud', () => {
    expect(formatNational('441234567')).toBe('44 123 45 67');
  });

  it('formats as far as the person has typed, with no trailing separator', () => {
    expect(formatNational('44')).toBe('44');
    expect(formatNational('441')).toBe('44 1');
    expect(formatNational('44123')).toBe('44 123');
    expect(formatNational('4412345')).toBe('44 123 45');
    expect(formatNational('')).toBe('');
  });
});

describe('toStoredPhone', () => {
  it('stores one canonical form', () => {
    expect(toStoredPhone('441234567')).toBe('+380441234567');
  });

  it('stores nothing for a half-typed number', () => {
    // A number that cannot be dialled is not worth keeping.
    expect(toStoredPhone('4412')).toBeNull();
    expect(toStoredPhone('')).toBeNull();
  });
});

describe('fromStoredPhone', () => {
  it('round-trips what toStoredPhone wrote', () => {
    expect(fromStoredPhone(toStoredPhone('441234567'))).toBe('441234567');
  });

  it('is empty for a person with no number', () => {
    expect(fromStoredPhone(null)).toBe('');
    expect(fromStoredPhone(undefined)).toBe('');
  });
});

describe('isCompleteOrEmpty', () => {
  it('accepts nothing and accepts a whole number', () => {
    expect(isCompleteOrEmpty('')).toBe(true);
    expect(isCompleteOrEmpty('441234567')).toBe(true);
  });

  it('refuses a fragment — the one case the field exists to stop', () => {
    expect(isCompleteOrEmpty('4412')).toBe(false);
  });
});
