import { describe, expect, it } from 'vitest';
import { formatIssn, isValidIssn, issnState } from './issn';

describe('isValidIssn', () => {
  it('accepts real ISSNs, with or without the hyphen', () => {
    expect(isValidIssn('0028-0836')).toBe(true); // Nature
    expect(isValidIssn('00280836')).toBe(true);
    expect(isValidIssn('2049-3630')).toBe(true);
    expect(isValidIssn('2434-561X')).toBe(true); // check character X
    expect(isValidIssn('2434-561x')).toBe(true);
  });

  it('refuses a wrong check digit, a short number and an X in the middle', () => {
    expect(isValidIssn('0028-0837')).toBe(false);
    expect(isValidIssn('0028-083')).toBe(false);
    expect(isValidIssn('00X8-0836')).toBe(false);
    expect(isValidIssn('')).toBe(false);
  });
});

describe('formatIssn', () => {
  it('puts the hyphen in and stops at eight characters', () => {
    expect(formatIssn('00280836')).toBe('0028-0836');
    expect(formatIssn('0028083699')).toBe('0028-0836');
    expect(formatIssn('0028')).toBe('0028');
    expect(formatIssn('00280')).toBe('0028-0');
  });

  it('drops letters, and an X anywhere but last', () => {
    expect(formatIssn('ab0028x0836')).toBe('0028-0836');
    expect(formatIssn('0317847x')).toBe('0317-847X');
  });
});

describe('issnState', () => {
  it('stays quiet while the number is still being typed', () => {
    expect(issnState('')).toBe('empty');
    expect(issnState('0028-08')).toBe('partial');
    expect(issnState('0028-0836')).toBe('valid');
    expect(issnState('0028-0837')).toBe('invalid');
  });
});
