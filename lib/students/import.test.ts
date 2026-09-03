import { describe, expect, it } from 'vitest';
import {
  importKey,
  parseTemplate,
  planImport,
  specialityFromCell,
  type SourceStudent,
} from './import';

const HEAD = ['ПІБ', 'Ступінь', 'Форма', 'Фінансування', 'Спеціальність'];
const ROW = ['Бедій Валерія Миколаївна', 'Магістр', 'Денна', 'Контракт', 'C4 Психологія'];

describe('specialityFromCell', () => {
  it('reads the code out of «C4 Психологія»', () => {
    expect(specialityFromCell('C4 Психологія')).toBe('Психологія');
  });

  it('accepts a bare code', () => {
    expect(specialityFromCell('A3')).toBe('Початкова освіта');
  });

  it('accepts our own name with no code', () => {
    expect(specialityFromCell('Початкова освіта')).toBe('Початкова освіта');
  });

  // The whole reason the CODE decides. The law renamed four of these, and the
  // ЄДЕБО export prints the law's wording — matching the name would turn every
  // one of them into an error on every import.
  it.each([
    ['C1 Економіка та міжнародні економічні відносини', 'Економіка'],
    [
      'D2 Фінанси, банківська справа, страхування та фондовий ринок',
      'Фінанси, банківська справа та страхування',
    ],
    [
      'B13 Бібліотечна, інформаційна та архівна справа',
      'Інформаційна, бібліотечна та архівна справа',
    ],
    ['I10 Соціальна робота та консультування', 'Соціальна робота'],
  ])('resolves %s by code, though the name disagrees with ours', (cell, expected) => {
    expect(specialityFromCell(cell)).toBe(expected);
  });

  // Наказ 192 gives every foreign language its own code; our norm table has one
  // row for all of them, because they share a норматив.
  it.each(['A4.021 Англійська мова', 'A4.022 Німецька мова', 'A4.027 Румунська мова'])(
    'folds %s onto the one foreign-language row',
    (cell) => {
      expect(specialityFromCell(cell)).toBe('Середня освіта (іноземна мова і література)');
    }
  );

  it('keeps a real sub-code separate from its parent', () => {
    expect(specialityFromCell('A4.03 Історія та громадянська освіта')).toBe(
      'Середня освіта (історія)'
    );
    expect(specialityFromCell('A4 Середня освіта')).not.toBe('Середня освіта (історія)');
  });

  // Found against the real магістр наказ: 21 of its 781 rows say «C1.01
  // Економіка», a спеціалізація of C1 that is the same speciality to us.
  it('falls back to the parent code for a спеціалізація we do not price apart', () => {
    expect(specialityFromCell('C1.01 Економіка')).toBe('Економіка');
  });

  // The fallback must never PREEMPT an exact match, or every предметна
  // спеціальність of A4 would collapse into one.
  it('prefers the exact sub-code over the parent', () => {
    expect(specialityFromCell('A4.07 Географія')).toBe('Середня освіта (географія)');
    expect(specialityFromCell('A4.11 Фізична культура')).toBe('Середня освіта (фізична культура)');
  });

  // Our норми price each subject separately, so a row that does not say which
  // one is a row nobody can score. Better refused than guessed.
  it('refuses a bare A4, which names no subject', () => {
    expect(specialityFromCell('A4 Середня освіта')).toBeNull();
  });

  it('returns null for a code and a name it knows nothing about', () => {
    expect(specialityFromCell('Z9 Вигадана справа')).toBeNull();
    expect(specialityFromCell('')).toBeNull();
  });
});

describe('parseTemplate', () => {
  it('reads a well-formed row', () => {
    const { rows, problems } = parseTemplate([HEAD, ROW]);

    expect(problems).toEqual([]);
    expect(rows).toEqual([
      {
        name: 'Бедій Валерія Миколаївна',
        speciality: 'Психологія',
        degree: 'MASTER',
        form: 'FULL_TIME',
        funding: 'CONTRACT',
      },
    ]);
  });

  // Column order is furniture, and a деканат that adds «№» should not have the
  // file bounced over it.
  it('matches columns by header, whatever their order, ignoring extra ones', () => {
    const head = ['№', 'Спеціальність', 'ПІБ', 'Примітка', 'Фінансування', 'Форма', 'Ступінь'];
    const row = [
      '1',
      'C4 Психологія',
      'Бедій Валерія Миколаївна',
      'щось',
      'Контракт',
      'Денна',
      'Магістр',
    ];

    const { rows, problems } = parseTemplate([head, row]);

    expect(problems).toEqual([]);
    expect(rows[0]!.speciality).toBe('Психологія');
    expect(rows[0]!.degree).toBe('MASTER');
  });

  it('names the columns it could not find, instead of reporting 800 bad rows', () => {
    const { rows, problems } = parseTemplate([
      ['ПІБ', 'Ступінь'],
      ['Хтось', 'Магістр'],
    ]);

    expect(rows).toEqual([]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('Форма');
    expect(problems[0]).toContain('Фінансування');
    expect(problems[0]).toContain('Спеціальність');
  });

  it('accepts the wording the university’s own накази use', () => {
    const { rows, problems } = parseTemplate([
      HEAD,
      ['Хтось Хтось Хтось', 'Бакалавр', 'Денна (офлайн)', 'Держзамовлення', 'A3'],
      [
        'Інший Інший Інший',
        'Бакалавр',
        'Заочна (онлайн)',
        'За кошти фізичних та юридичних осіб',
        'A3',
      ],
    ]);

    expect(problems).toEqual([]);
    expect(rows.map((r) => [r.form, r.funding])).toEqual([
      ['FULL_TIME', 'STATE'],
      ['PART_TIME', 'CONTRACT'],
    ]);
  });

  it('ignores case and stray spacing in the enum cells', () => {
    const { rows, problems } = parseTemplate([
      HEAD,
      ['Хтось Хтось Хтось', '  МАГІСТР ', 'денна', ' Бюджет', 'C4 Психологія'],
    ]);

    expect(problems).toEqual([]);
    expect(rows[0]).toMatchObject({ degree: 'MASTER', form: 'FULL_TIME', funding: 'STATE' });
  });

  it('collapses runs of whitespace in the ПІБ', () => {
    const { rows } = parseTemplate([HEAD, ['  Бедій   Валерія\tМиколаївна ', ...ROW.slice(1)]]);
    expect(rows[0]!.name).toBe('Бедій Валерія Миколаївна');
  });

  // Excel files trail hundreds of them.
  it('skips a row with no ПІБ without calling it a problem', () => {
    const { rows, problems } = parseTemplate([HEAD, ROW, ['', '', '', '', ''], ['   ']]);

    expect(rows).toHaveLength(1);
    expect(problems).toEqual([]);
  });

  it('reports the sheet row number a person can see in Excel', () => {
    const { problems } = parseTemplate([
      HEAD,
      ROW,
      ['Поганий Рядок Тестовий', 'Аспірант', 'Денна', 'Бюджет', 'C4 Психологія'],
    ]);

    expect(problems).toEqual([
      'Рядок 3 (Поганий Рядок Тестовий): не розпізнано ступінь «Аспірант»',
    ]);
  });

  it.each([
    [['Хтось Хтось Хтось', 'Магістр', 'Вечірня', 'Бюджет', 'C4 Психологія'], 'форму'],
    [['Хтось Хтось Хтось', 'Магістр', 'Денна', 'Грант', 'C4 Психологія'], 'фінансування'],
    [['Хтось Хтось Хтось', 'Магістр', 'Денна', 'Бюджет', 'Z9 Вигадана'], 'спеціальність'],
  ])('reports an unreadable cell rather than guessing', (row, word) => {
    const { rows, problems } = parseTemplate([HEAD, row]);

    expect(rows).toEqual([]);
    expect(problems[0]).toContain(word);
  });

  it('says so when the file has a header and nothing else', () => {
    expect(parseTemplate([HEAD]).problems).toEqual(['У файлі немає жодного рядка']);
  });

  it('says so when the file is empty', () => {
    expect(parseTemplate([]).problems).toEqual(['Файл порожній']);
  });
});

const IDS = new Map([
  ['Психологія', 'sp-psy'],
  ['Початкова освіта', 'sp-prim'],
]);

function student(over: Partial<SourceStudent> = {}): SourceStudent {
  return {
    name: 'Ковальчук Олена Ігорівна',
    speciality: 'Психологія',
    degree: 'BACHELOR',
    form: 'FULL_TIME',
    funding: 'STATE',
    ...over,
  };
}

describe('planImport', () => {
  it('plans a row with the ПІБ normalised and the speciality resolved to an id', () => {
    const plan = planImport(2026, [student()], IDS, new Set());

    expect(plan.problems).toEqual([]);
    expect(plan.skipped).toEqual([]);
    expect(plan.create).toEqual([
      {
        year: 2026,
        name: 'Ковальчук Олена Ігорівна',
        nameNormalised: 'ковальчук олена ігорівна',
        specialityId: 'sp-psy',
        degree: 'BACHELOR',
        form: 'FULL_TIME',
        funding: 'STATE',
      },
    ]);
  });

  it('skips a row the database already holds, and does not call it a problem', () => {
    const plan = planImport(2026, [student()], IDS, new Set([importKey(2026, student())]));

    expect(plan.create).toEqual([]);
    expect(plan.skipped).toHaveLength(1);
    expect(plan.problems).toEqual([]);
  });

  it('skips a row the same FILE lists twice', () => {
    const plan = planImport(2026, [student(), student()], IDS, new Set());

    expect(plan.create).toHaveLength(1);
    expect(plan.skipped).toHaveLength(1);
  });

  it('keeps one person twice when the programme differs', () => {
    const plan = planImport(
      2026,
      [student(), student({ speciality: 'Початкова освіта' })],
      IDS,
      new Set()
    );

    expect(plan.create).toHaveLength(2);
    expect(plan.skipped).toEqual([]);
  });

  it('reports an unresolvable speciality instead of inventing one', () => {
    const plan = planImport(2026, [student({ speciality: 'Вигадана' })], IDS, new Set());

    expect(plan.create).toEqual([]);
    expect(plan.problems).toEqual([
      'Ковальчук Олена Ігорівна: спеціальності «Вигадана» немає в базі',
    ]);
  });

  it('keys by year, so another campaign is never a duplicate', () => {
    const plan = planImport(2027, [student()], IDS, new Set([importKey(2026, student())]));

    expect(plan.create).toHaveLength(1);
    expect(plan.create[0]!.year).toBe(2027);
  });
});
