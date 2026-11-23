import { describe, expect, it } from 'vitest';
import { select, text, checkbox } from '@/lib/rating/evidence-fields';
import {
  disciplineKey,
  evidenceDisciplineKey,
  hasDisciplineField,
  missingDisciplines,
  uniqueDisciplines,
  withAssignedDisciplines,
} from './assigned';

describe('disciplineKey', () => {
  it('ignores case, spaces, quotes and a trailing dot', () => {
    expect(disciplineKey('  Безпека   життєдіяльності. ')).toBe('безпека життєдіяльності');
    expect(disciplineKey('Мова «Англійська»')).toBe('мова англійська');
    expect(disciplineKey('Пів’ясна')).toBe(disciplineKey("Пів'ясна"));
  });
});

describe('uniqueDisciplines', () => {
  it('keeps one of the same name taught to several groups, first spelling wins', () => {
    const got = uniqueDisciplines([
      'Психодіагностика',
      ' психодіагностика ',
      'Реабілітаційна психологія',
      '',
    ]);
    expect(got.map((g) => g.name)).toEqual(['Психодіагностика', 'Реабілітаційна психологія']);
  });

  it('does NOT merge differently worded names — «БЖД» and «Основи ЦЗ» are two entries', () => {
    expect(
      uniqueDisciplines(['БЖД', 'Основи ЦЗ', 'Безпека життєдіяльності з основами ЦЗ'])
    ).toHaveLength(3);
  });
});

describe('missingDisciplines', () => {
  const assigned = uniqueDisciplines(['Фізика', 'Хімія', 'Біологія']);

  it('lists what no entry names yet, in the assigned order', () => {
    const got = missingDisciplines(assigned, [{ discipline: 'хімія ', isLecturer: true }]);
    expect(got.map((g) => g.name)).toEqual(['Фізика', 'Біологія']);
  });

  it('counts an entry marked «Не лектор» as an answer', () => {
    expect(missingDisciplines(assigned, [{ discipline: 'Фізика', isLecturer: false }]).length).toBe(
      2
    );
  });

  it('is empty when every discipline has an entry, and ignores entries naming nothing', () => {
    const all = assigned.map((a) => ({ discipline: a.name }));
    expect(missingDisciplines(assigned, [...all, {}, null])).toEqual([]);
  });
});

describe('evidenceDisciplineKey', () => {
  it('reads the discipline of an entry, null when there is none', () => {
    expect(evidenceDisciplineKey({ discipline: ' Фізика ' })).toBe('фізика');
    expect(evidenceDisciplineKey({ discipline: '' })).toBeNull();
    expect(evidenceDisciplineKey(null)).toBeNull();
  });
});

describe('withAssignedDisciplines', () => {
  const fields = [
    checkbox('isLecturer', 'Я лектор'),
    text('discipline', 'Дисципліна', {
      requiredWhen: { field: 'isLecturer', checked: true },
      fromDisciplines: true,
    }),
  ];

  it('recognises a form that asks for a discipline', () => {
    expect(hasDisciplineField(fields)).toBe(true);
    expect(hasDisciplineField([checkbox('a', 'A')])).toBe(false);
  });

  it('turns the box into an always-drawn select over the list', () => {
    const got = withAssignedDisciplines(fields, ['Фізика', 'Хімія']);
    const box = got.find((f) => f.name === 'discipline');
    expect(box).toMatchObject({ kind: 'select' });
    expect(box && 'requiredWhen' in box).toBe(false);
    expect(box && box.kind === 'select' && box.options.map((o) => o.value)).toEqual([
      'Фізика',
      'Хімія',
    ]);
  });

  it('leaves the text box for a person with no list', () => {
    expect(withAssignedDisciplines(fields, [])).toEqual(fields);
  });

  it('leaves other fields alone', () => {
    const other = [select('mode', 'Вид', [{ value: 'a', label: 'A' }])];
    expect(withAssignedDisciplines(other, ['Фізика'])).toEqual(other);
  });
});
