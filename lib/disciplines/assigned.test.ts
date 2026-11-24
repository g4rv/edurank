import { describe, expect, it } from 'vitest';
import { select, text, checkbox } from '@/lib/rating/evidence-fields';
import {
  disciplineKey,
  evidenceDisciplineKey,
  hasDisciplineField,
  isRepeatEntry,
  missingDisciplines,
  uniqueDisciplines,
  unmatchedEntries,
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

describe('isRepeatEntry', () => {
  const link = (id: number) => `https://moodle.uhsp.edu.ua/course/view.php?id=${id}`;

  it('is the same entry when discipline, answer and link all agree, spelling aside', () => {
    expect(
      isRepeatEntry(
        { discipline: 'Фізика', isLecturer: true, link: link(1) },
        { discipline: ' фізика. ', isLecturer: true, link: link(1).toUpperCase() }
      )
    ).toBe(true);
  });

  it('is another group when the link differs', () => {
    expect(
      isRepeatEntry(
        { discipline: 'Фізика', isLecturer: true, link: link(1) },
        { discipline: 'Фізика', isLecturer: true, link: link(2) }
      )
    ).toBe(false);
  });

  it('keeps «не лектор» and a lecturer entry apart', () => {
    expect(
      isRepeatEntry(
        { discipline: 'Фізика', isLecturer: false },
        { discipline: 'Фізика', isLecturer: true }
      )
    ).toBe(false);
  });

  it('two «не лектор» entries for one discipline are a repeat', () => {
    expect(
      isRepeatEntry({ discipline: 'Фізика', isLecturer: false }, { discipline: 'Фізика' })
    ).toBe(true);
  });

  it('is never a repeat of something about another discipline or about none', () => {
    expect(isRepeatEntry({ discipline: 'Фізика' }, { discipline: 'Хімія' })).toBe(false);
    expect(isRepeatEntry({}, {})).toBe(false);
  });
});

describe('withAssignedDisciplines marks the answered ones', () => {
  it('keeps every name on offer and puts a tick after the done ones', () => {
    const fields = [
      { kind: 'text', name: 'discipline', label: 'Дисципліна', fromDisciplines: true },
    ] as const;
    const [select] = withAssignedDisciplines(fields, ['Фізика', 'Хімія'], new Set(['Фізика']));
    expect(select).toMatchObject({
      kind: 'select',
      options: [
        { value: 'Фізика', label: 'Фізика ✓' },
        { value: 'Хімія', label: 'Хімія' },
      ],
    });
  });
});

describe('unmatchedEntries', () => {
  const assigned = uniqueDisciplines(['Фізика', 'Хімія']);
  const entries = [
    { id: 'a', evidence: { discipline: 'Фізика', isLecturer: false } },
    { id: 'b', evidence: { discipline: ' Фізика  (фвху) ', link: 'https://m/1' } },
    { id: 'c', evidence: { discipline: 'Астрономія', link: 'https://m/2' } },
    { id: 'd', evidence: { isLecturer: false } },
  ];

  it('keeps the entries that name no assigned discipline, with the name as typed', () => {
    expect(unmatchedEntries(assigned, entries)).toEqual([
      { activityId: 'b', name: 'Фізика (фвху)', link: 'https://m/1' },
      { activityId: 'c', name: 'Астрономія', link: 'https://m/2' },
    ]);
  });

  it('is empty when every entry sits on an assigned discipline', () => {
    expect(unmatchedEntries(assigned, [entries[0]])).toEqual([]);
  });
});
