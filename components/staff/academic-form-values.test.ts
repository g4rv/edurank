import { describe, expect, it } from 'vitest';
import { EMPTY_DEGREE_ROW, diplomaProblems, type DegreeFormRow } from './academic-form-values';

const full = (patch: Partial<DegreeFormRow>): DegreeFormRow => ({
  ...EMPTY_DEGREE_ROW,
  specialty: 'Право',
  defenceDate: '2020-05-05',
  issuedBy: 'ХНУ',
  number: '1',
  ...patch,
});

describe('diplomaProblems — the popup’s words for diplomaGaps (owner, 2026-10-15)', () => {
  it('asks for everything of a blank entry except the серія', () => {
    expect(Object.keys(diplomaProblems(EMPTY_DEGREE_ROW)).sort()).toEqual(
      ['defenceDate', 'degree', 'issueDate', 'issuedBy', 'number', 'specialty', 'topic'].sort()
    );
  });

  it('asks a basic education for its level, not a topic or a second date', () => {
    expect(diplomaProblems(full({ degree: 'basic_education' }))).toEqual({
      basicLevel: 'Оберіть рівень освіти',
    });
    expect(diplomaProblems(full({ degree: 'basic_education', basicLevel: 'master' }))).toEqual({});
  });

  it('asks a degree for its topic and issue date, and refuses one issued before the defence', () => {
    expect(Object.keys(diplomaProblems(full({ degree: 'phd' }))).sort()).toEqual([
      'issueDate',
      'topic',
    ]);
    expect(
      diplomaProblems(full({ degree: 'phd', topic: 'Тема', issueDate: '2020-01-01' }))
    ).toEqual({ issueDate: 'Диплом не може бути виданий раніше захисту' });
    expect(
      diplomaProblems(full({ degree: 'phd', topic: 'Тема', issueDate: '2020-09-01' }))
    ).toEqual({});
  });

  it('names the date by kind', () => {
    expect(diplomaProblems(full({ degree: 'phd', defenceDate: '' })).defenceDate).toBe(
      'Вкажіть дату захисту'
    );
    expect(
      diplomaProblems(full({ degree: 'basic_education', basicLevel: 'master', defenceDate: '' }))
        .defenceDate
    ).toBe('Вкажіть дату видачі диплома');
  });
});
