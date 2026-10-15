import { describe, expect, it } from 'vitest';
import { EMPTY_DEGREE_ROW, diplomaProblems, type DegreeFormRow } from './academic-form-values';

const full = (patch: Partial<DegreeFormRow>): DegreeFormRow => ({
  ...EMPTY_DEGREE_ROW,
  specialty: 'Право',
  defenceDate: '2020-05-05',
  issuedBy: 'ХНУ',
  series: 'ДК',
  number: '1',
  ...patch,
});

describe('diplomaProblems — every field but «відповідає кафедрі» (owner, 2026-10-15)', () => {
  it('asks for everything of a blank entry', () => {
    expect(Object.keys(diplomaProblems(EMPTY_DEGREE_ROW)).sort()).toEqual(
      [
        'defenceDate',
        'degree',
        'issuedBy',
        'number',
        'series',
        'specialty',
        'topic',
        'issueDate',
      ].sort()
    );
  });

  it('asks a basic education for its level, not a topic or a second date', () => {
    expect(diplomaProblems(full({ degree: 'basic_education' }))).toEqual({
      basicLevel: 'Оберіть рівень освіти',
    });
    expect(diplomaProblems(full({ degree: 'basic_education', basicLevel: 'master' }))).toEqual({});
  });

  it('asks a degree for its topic and issue date, not a level', () => {
    expect(Object.keys(diplomaProblems(full({ degree: 'phd' }))).sort()).toEqual([
      'issueDate',
      'topic',
    ]);
    expect(
      diplomaProblems(full({ degree: 'phd', topic: 'Тема', issueDate: '2020-09-01' }))
    ).toEqual({});
  });

  it('does not ask for «відповідає кафедрі», and treats spaces as empty', () => {
    expect(diplomaProblems(full({ degree: 'basic_education', basicLevel: 'master' }))).toEqual({});
    expect(
      diplomaProblems(full({ degree: 'basic_education', basicLevel: 'master', series: '  ' }))
    ).toHaveProperty('series');
  });
});
