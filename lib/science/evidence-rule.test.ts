import { describe, expect, it } from 'vitest';
import {
  DOI_IN_LINK,
  doiProof,
  evidenceProblem,
  linkHint,
  linkLabel,
  linkProblem,
  proofRulesProblem,
} from './evidence-rule';

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
    // Names only what this вид роботи offers — there is no file box to fill.
    expect(check({ fileRule: 'NONE', fileCount: 1 })).toBe('Додайте посилання');
    expect(check({ fileRule: 'NONE', link: LINK })).toBeNull();
  });

  it('a NONE link never satisfies «one of the two»', () => {
    expect(check({ linkRule: 'NONE', link: LINK })).toBe('Додайте файл підтвердження');
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
    expect(check({ linkRule: 'OPTIONAL', fileRule: 'NONE' })).toBe('Додайте посилання');
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
      'Джерело, яке підтверджує виконання роботи.'
    );
  });

  it('uses the наказ’s own «Форма звітності» when a file is allowed too', () => {
    expect(linkHint({ fileRule: 'OPTIONAL', reportingForm: 'Свідоцтво' })).toBe(
      'Свідоцтво — посилання на сторінку, де це опубліковано.'
    );
    expect(linkHint({ fileRule: 'OPTIONAL', reportingForm: null })).toMatch(/DOI/);
  });
});

// The стаття: link OR DOI, at least one (owner, 2026-10-02).
describe('a DOI is a third proof', () => {
  const article = (over: Partial<Parameters<typeof evidenceProblem>[0]> = {}) =>
    check({ linkRule: 'OPTIONAL', fileRule: 'NONE', doi: null, ...over });

  it('accepts a DOI alone', () => {
    expect(article({ doi: '10.31392/xyz' })).toBeNull();
  });

  it('accepts a link alone', () => {
    expect(article({ link: 'https://journal.example/a' })).toBeNull();
  });

  it('refuses neither, and names the two it offers', () => {
    expect(article()).toBe('Додайте посилання або DOI');
  });

  it('names all three where a file is offered too', () => {
    expect(check({ doi: null })).toBe('Додайте посилання, DOI або файл підтвердження');
  });

  it('does not stand in for a REQUIRED link', () => {
    expect(article({ linkRule: 'REQUIRED', doi: '10.31392/xyz' })).toBe(
      'Для цього виду роботи потрібне посилання'
    );
  });

  it('is not offered where the type has no DOI field', () => {
    expect(check({ fileRule: 'NONE' })).toBe('Додайте посилання');
  });
});

describe('doiProof', () => {
  const fields = [
    { kind: 'text', name: 'title' },
    { kind: 'doi', name: 'doi' },
  ];

  it('reads the DOI field, trimmed', () => {
    expect(doiProof(fields, { doi: ' 10.31392/xyz ' })).toBe('10.31392/xyz');
  });

  it('is null when the field is empty, undefined when the type has none', () => {
    expect(doiProof(fields, { doi: '  ' })).toBeNull();
    expect(doiProof(fields, {})).toBeNull();
    expect(doiProof([{ kind: 'text', name: 'title' }], { doi: '10.1/x' })).toBeUndefined();
  });
});

describe('linkProblem — a DOI belongs in the DOI field', () => {
  it('refuses a doi.org link, a doi: prefix and a bare DOI', () => {
    expect(linkProblem('https://doi.org/10.31392/xyz', true)).toBe(DOI_IN_LINK);
    expect(linkProblem('doi:10.31392/xyz', true)).toBe(DOI_IN_LINK);
    expect(linkProblem('10.31392/xyz', true)).toBe(DOI_IN_LINK);
  });

  it('accepts a journal page, even one with «doi» in its path', () => {
    expect(linkProblem('https://journal.example/doi/10.31392/xyz', true)).toBeNull();
  });

  it('accepts anything on a type with no DOI field', () => {
    expect(linkProblem('https://doi.org/10.31392/xyz', false)).toBeNull();
  });
});

describe('linkHint on a type with a DOI field', () => {
  it('says the link may be skipped when the DOI is there', () => {
    expect(linkHint({ fileRule: 'NONE', fields: [{ kind: 'doi' }] })).toBe(
      'Сторінка, де опубліковано роботу. Можна не вказувати, якщо нижче є DOI.'
    );
  });
});
