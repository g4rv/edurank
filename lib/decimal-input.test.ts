import { describe, expect, it } from 'vitest';
import { hasTooManyDecimals, limitDecimals } from './decimal-input';

describe('limitDecimals', () => {
  it('cuts the second digit after the point', () => {
    expect(limitDecimals('1.73', 1)).toBe('1.7');
    expect(limitDecimals('1,73', 1)).toBe('1.7');
  });
  it('keeps a trailing point so the person can go on typing', () => {
    expect(limitDecimals('1.', 1)).toBe('1.');
    expect(limitDecimals('1,', 1)).toBe('1.');
  });
  it('drops letters and a second point', () => {
    expect(limitDecimals('1a.5.9', 1)).toBe('1.5');
    expect(limitDecimals('abc', 1)).toBe('');
  });
  it('leaves a whole number and a valid decimal alone', () => {
    expect(limitDecimals('12', 1)).toBe('12');
    expect(limitDecimals('1.6', 1)).toBe('1.6');
  });
  it('with 0 decimals keeps only the whole part', () => {
    expect(limitDecimals('3.9', 0)).toBe('3');
  });
});

describe('hasTooManyDecimals', () => {
  it('accepts one decimal, refuses two', () => {
    expect(hasTooManyDecimals(1.6, 1)).toBe(false);
    expect(hasTooManyDecimals(1.7, 1)).toBe(false);
    expect(hasTooManyDecimals(5, 1)).toBe(false);
    expect(hasTooManyDecimals(1.73, 1)).toBe(true);
    expect(hasTooManyDecimals(1.05, 1)).toBe(true);
  });
  it('is not fooled by binary floats (0.1 + 0.2)', () => {
    expect(hasTooManyDecimals(0.1 + 0.2, 1)).toBe(false);
  });
});
