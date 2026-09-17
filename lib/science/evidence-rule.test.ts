import { describe, expect, it } from 'vitest';
import { evidenceProblem } from './evidence-rule';

const check = (over: Partial<Parameters<typeof evidenceProblem>[0]> = {}) =>
  evidenceProblem({ requiresFile: false, link: null, fileCount: 0, ...over });

describe('evidenceProblem', () => {
  it('refuses a record with neither link nor file — never neither (D27)', () => {
    expect(check()).toBe('Додайте посилання або файл підтвердження');
  });

  it('accepts a link alone', () => {
    expect(check({ link: 'https://doi.org/10.31392/xyz' })).toBeNull();
  });

  it('accepts a file alone — the same сертифікат is a URL for one person and a PDF for another', () => {
    expect(check({ fileCount: 1 })).toBeNull();
  });

  it('refuses a link alone where the type says a link is not enough', () => {
    expect(check({ requiresFile: true, link: 'https://example.com/x' })).toBe(
      'Для цього виду роботи потрібен файл підтвердження'
    );
  });

  it('accepts a file where the type demands one, link or no link', () => {
    expect(check({ requiresFile: true, fileCount: 1 })).toBeNull();
    expect(check({ requiresFile: true, fileCount: 1, link: 'https://example.com/x' })).toBeNull();
  });

  it('treats a blank link as no link', () => {
    expect(check({ link: '   ' })).not.toBeNull();
  });

  it('names the file rule first when both rules would fire', () => {
    // Nothing at all on a requiresFile type: the useful sentence is the one
    // that says what this particular вид роботи needs, not the generic one.
    expect(check({ requiresFile: true })).toBe('Для цього виду роботи потрібен файл підтвердження');
  });
});
