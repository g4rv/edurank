import { describe, expect, it } from 'vitest';
import { isValidIsbn, isbnState, normalizeIsbn } from './isbn';

// Real ISBNs, used so the checksums are genuine rather than made to fit
const ISBN13 = '9783161484100';
const ISBN13_HYPHENS = '978-3-16-148410-0';
const ISBN10 = '0306406152';
const ISBN10_X = '080442957X'; // check character X = 10

describe('normalizeIsbn', () => {
  it('drops hyphens and spaces', () => {
    expect(normalizeIsbn(ISBN13_HYPHENS)).toBe(ISBN13);
    expect(normalizeIsbn('0 306 40615 2')).toBe(ISBN10);
  });

  it('uppercases the X check character', () => {
    expect(normalizeIsbn('080442957x')).toBe(ISBN10_X);
  });

  it('strips anything that is not a digit or X', () => {
    expect(normalizeIsbn('ISBN: 978-3-16-148410-0.')).toBe(ISBN13);
  });
});

describe('isValidIsbn', () => {
  it('accepts a correct ISBN-13, with or without hyphens', () => {
    expect(isValidIsbn(ISBN13)).toBe(true);
    expect(isValidIsbn(ISBN13_HYPHENS)).toBe(true);
  });

  it('accepts a correct ISBN-10, including the X check character', () => {
    expect(isValidIsbn(ISBN10)).toBe(true);
    expect(isValidIsbn(ISBN10_X)).toBe(true);
    expect(isValidIsbn('0-8044-2957-x')).toBe(true);
  });

  // The whole point: a check digit catches the mistakes people actually make
  it('rejects a single mistyped digit', () => {
    expect(isValidIsbn('9783161484101')).toBe(false);
    expect(isValidIsbn('0306406153')).toBe(false);
  });

  it('rejects two swapped digits', () => {
    expect(isValidIsbn('9783161844100')).toBe(false);
  });

  it('rejects wrong lengths', () => {
    expect(isValidIsbn('')).toBe(false);
    expect(isValidIsbn('978316148410')).toBe(false); // 12
    expect(isValidIsbn('97831614841000')).toBe(false); // 14
    expect(isValidIsbn('030640615')).toBe(false); // 9
  });

  it('rejects a 13-digit number that is not a book EAN', () => {
    // Correct 1/3 checksum but a 977 (periodicals) prefix, so not an ISBN
    expect(isValidIsbn('9771234567003')).toBe(false);
  });

  it('rejects X anywhere except the ISBN-10 check position', () => {
    expect(isValidIsbn('X306406152')).toBe(false);
    expect(isValidIsbn('978316148410X')).toBe(false);
  });

  it('rejects text and punctuation on their own', () => {
    expect(isValidIsbn('немає')).toBe(false);
    expect(isValidIsbn('—')).toBe(false);
  });
});

describe('isbnState', () => {
  it('is empty for no input', () => {
    expect(isbnState('')).toBe('empty');
    expect(isbnState('  -- ')).toBe('empty');
  });

  // Typing must not turn red before the number can possibly be complete
  it('is partial while the number is still too short', () => {
    expect(isbnState('978')).toBe('partial');
    expect(isbnState('978316148')).toBe('partial');
    expect(isbnState('97831614841')).toBe('partial'); // 11 — between the two lengths
  });

  it('is valid once the checksum passes', () => {
    expect(isbnState(ISBN13_HYPHENS)).toBe('valid');
    expect(isbnState(ISBN10_X)).toBe('valid');
  });

  it('is invalid at a full length with a bad checksum', () => {
    expect(isbnState('9783161484101')).toBe('invalid');
    expect(isbnState('0306406153')).toBe('invalid');
  });

  it('is invalid once the input is too long to be either format', () => {
    expect(isbnState('97831614841000')).toBe('invalid');
  });
});
