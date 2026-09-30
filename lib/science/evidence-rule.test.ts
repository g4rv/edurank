import { describe, expect, it } from 'vitest';
import { evidenceProblem, linkHint, linkLabel, proofRulesProblem } from './evidence-rule';

const check = (over: Partial<Parameters<typeof evidenceProblem>[0]> = {}) =>
  evidenceProblem({
    linkRule: 'OPTIONAL',
    fileRule: 'OPTIONAL',
    link: null,
    fileCount: 0,
    ...over,
  });

const LINK = 'https://doi.org/10.31392/xyz';

describe('evidenceProblem — both optional (D27)', () => {
  it('refuses a record with neither link nor file — never neither', () => {
    expect(check()).toBe('Додайте посилання або файл підтвердження');
  });

  it('accepts a link alone', () => {
    expect(check({ link: LINK })).toBeNull();
  });

  it('accepts a file alone — the same сертифікат is a URL for one person and a PDF for another', () => {
    expect(check({ fileCount: 1 })).toBeNull();
  });

  it('treats a blank link as no link', () => {
    expect(check({ link: '   ' })).not.toBeNull();
  });
});

describe('evidenceProblem — a REQUIRED side (D47)', () => {
  it('refuses a missing required link, even with a file', () => {
    expect(check({ linkRule: 'REQUIRED', fileCount: 1 })).toBe(
      'Для цього виду роботи потрібне посилання'
    );
  });

  it('refuses a missing required file, even with a link', () => {
    expect(check({ fileRule: 'REQUIRED', link: LINK })).toBe(
      'Для цього виду роботи потрібен файл підтвердження'
    );
  });

  it('asks for both when both are required', () => {
    expect(check({ linkRule: 'REQUIRED', fileRule: 'REQUIRED', link: LINK })).toBe(
      'Для цього виду роботи потрібен файл підтвердження'
    );
    expect(
      check({ linkRule: 'REQUIRED', fileRule: 'REQUIRED', link: LINK, fileCount: 1 })
    ).toBeNull();
  });

  it('names the file rule first when both required proofs are missing', () => {
    // Nothing at all: the useful sentence is one that says what this вид
    // роботи needs, never the generic «one of the two».
    expect(check({ linkRule: 'REQUIRED', fileRule: 'REQUIRED' })).toBe(
      'Для цього виду роботи потрібен файл підтвердження'
    );
  });

  it('asks nothing more of the optional side once the required one is there', () => {
    expect(check({ linkRule: 'REQUIRED', link: LINK })).toBeNull();
    expect(check({ fileRule: 'REQUIRED', fileCount: 1 })).toBeNull();
  });
});

describe('evidenceProblem — a NONE side proves nothing (D47)', () => {
  it('link only: a link is enough', () => {
    expect(check({ linkRule: 'REQUIRED', fileRule: 'NONE', link: LINK })).toBeNull();
  });

  it('link only: a leftover file does not stand in for the link', () => {
    expect(check({ linkRule: 'REQUIRED', fileRule: 'NONE', fileCount: 1 })).toBe(
      'Для цього виду роботи потрібне посилання'
    );
  });

  it('an optional link beside a NONE file is in practice the only proof', () => {
    expect(check({ fileRule: 'NONE', fileCount: 1 })).toBe(
      'Додайте посилання або файл підтвердження'
    );
    expect(check({ fileRule: 'NONE', link: LINK })).toBeNull();
  });

  it('a NONE link never satisfies «one of the two»', () => {
    expect(check({ linkRule: 'NONE', link: LINK })).toBe(
      'Додайте посилання або файл підтвердження'
    );
    expect(check({ linkRule: 'NONE', fileCount: 1 })).toBeNull();
  });
});

describe('no proof needed — both NONE (owner, 2026-09-24)', () => {
  it('accepts a record with neither link nor file', () => {
    expect(check({ linkRule: 'NONE', fileRule: 'NONE' })).toBeNull();
  });

  it('is a pair ADMIN may save — like every other pair', () => {
    const rules = ['REQUIRED', 'OPTIONAL', 'NONE'] as const;
    for (const link of rules) {
      for (const file of rules) {
        expect(proofRulesProblem(link, file)).toBeNull();
      }
    }
  });

  it('still refuses «neither» wherever one of the two is offered (D27)', () => {
    expect(check({ linkRule: 'OPTIONAL', fileRule: 'NONE' })).toBe(
      'Додайте посилання або файл підтвердження'
    );
  });
});

describe('what the link box is called', () => {
  it('is the link to the WORK itself where it is the only proof', () => {
    // An article's link IS the article. Calling it «підтвердження» beside a
    // form that has no other proof read as a second, different link
    // (owner, 2026-09-30).
    expect(linkLabel('NONE')).toBe('Посилання на роботу');
  });

  it('stays a proof link where a file may stand in for it', () => {
    expect(linkLabel('OPTIONAL')).toBe('Посилання на підтвердження');
    expect(linkLabel('REQUIRED')).toBe('Посилання на підтвердження');
  });

  it('tells a link-only type where the page is, and does not talk about a proof', () => {
    expect(linkHint({ fileRule: 'NONE', reportingForm: null })).toBe(
      'Сторінка, де роботу опубліковано або розміщено. ННВ перевірить її.'
    );
  });

  it('uses the наказ’s own «Форма звітності» when a file is allowed too', () => {
    expect(linkHint({ fileRule: 'OPTIONAL', reportingForm: 'Свідоцтво' })).toBe(
      'Свідоцтво — посилання на сторінку, де це опубліковано.'
    );
    expect(linkHint({ fileRule: 'OPTIONAL', reportingForm: null })).toMatch(/DOI/);
  });
});
