import { describe, expect, it } from 'vitest';
import { BASIC_LEVELS, degreeLevel, degreeTitle, diplomaDocument } from './academic-options';

describe('basic education levels (owner, 2026-10-15)', () => {
  it('offers бакалавр, спеціаліст and магістр', () => {
    expect(BASIC_LEVELS.map((l) => l.value)).toEqual(['bachelor', 'specialist', 'master']);
  });

  it('keeps the entry ONE kind for the rating — the level is not a degree key', () => {
    expect(degreeLevel('basic_education')).toBe('basic');
    expect(degreeLevel('master')).toBeNull();
  });
});

describe('degreeTitle', () => {
  it('adds the level to a basic education only when it is told', () => {
    expect(degreeTitle('basic_education')).toBe('Базова освіта');
    expect(degreeTitle('basic_education', 'master')).toBe('Базова освіта — Магістр');
  });
});

describe('diplomaDocument', () => {
  it('prints what is filled, on one line', () => {
    expect(
      diplomaDocument({
        issuedBy: 'ХНУ',
        series: 'АА',
        number: '123456',
        issueDate: '2010-06-01',
      })
    ).toBe('Видав ХНУ · серія АА № 123456 · від 01.06.2010');
  });

  it('leaves out a blank part, and says nothing when all are blank', () => {
    expect(diplomaDocument({ number: '7' })).toBe('№ 7');
    expect(diplomaDocument({ series: 'АА' })).toBe('серія АА');
    expect(
      diplomaDocument({ issuedBy: ' ', series: '', number: null, issueDate: null })
    ).toBeNull();
  });
});
