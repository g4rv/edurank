import { describe, expect, it } from 'vitest';
import { pickedGroup, pickedKey } from './pick';
import { SCIENCE_WORK_TYPES_2027 } from '@/lib/science/work-types-2027';

const catalogueScienceType = (code: string) => {
  const def = SCIENCE_WORK_TYPES_2027.find((d) => d.code === code);
  if (!def) throw new Error(code);
  return def;
};

// п.12 names an аспірант from the аспірантура's list (owner, 2026-10-07), once
// `db:import-aspirants --pick` marks the group — shown here on its own fields.
describe('a ПІБ chosen, not typed', () => {
  const fields = [
    ...catalogueScienceType('phd_supervision').fields.map((f) =>
      f.kind === 'text' && f.name === 'studentLast' ? { ...f, pickFrom: 'aspirants' as const } : f
    ),
  ];

  it('marks the group, keeping its three stored fields', () => {
    expect(pickedGroup(fields)).toEqual({
      pickFrom: 'aspirants',
      names: ['studentLast', 'studentFirst', 'studentMiddle'],
    });
  });

  it('is off in the catalogue until a complete list is in', () => {
    expect(pickedGroup(catalogueScienceType('phd_supervision').fields)).toBeNull();
  });

  it('keys the stored name the way the list does, case and apostrophes folded', () => {
    const names = ['studentLast', 'studentFirst', 'studentMiddle'];
    expect(
      pickedKey(names, {
        studentLast: 'Іващенко',
        studentFirst: 'Анатолій',
        studentMiddle: 'Іванович',
      })
    ).toBe('іващенко анатолій іванович');
    expect(pickedKey(names, { studentLast: 'Д’Яченко', studentFirst: 'Ольга' })).toBe(
      "д'яченко ольга"
    );
  });

  it('leaves a typed ПІБ elsewhere alone', () => {
    expect(pickedGroup(catalogueScienceType('student_research_win').fields)).toBeNull();
  });
});
