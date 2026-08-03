import { describe, expect, it } from 'vitest';
import { buildRatingWorkbook, ratingFileNames, type ExportActivityType } from './export-workbook';

describe('ratingFileNames', () => {
  it('keeps a plain name as-is', () => {
    expect(ratingFileNames(['Коваленко Іван Петрович'])).toEqual(['Коваленко Іван Петрович.xlsx']);
  });

  // Two people really can share a ПІБ — without a suffix the zip keeps only one
  it('suffixes repeats instead of overwriting them', () => {
    expect(
      ratingFileNames([
        'Шевченко Тарас Григорович',
        'Мельник Ольга Ігорівна',
        'Шевченко Тарас Григорович',
      ])
    ).toEqual([
      'Шевченко Тарас Григорович.xlsx',
      'Мельник Ольга Ігорівна.xlsx',
      'Шевченко Тарас Григорович (2).xlsx',
    ]);
  });

  it('numbers a third namesake separately', () => {
    const names = ratingFileNames(Array(3).fill('Бондаренко Марія Олексіївна'));
    expect(new Set(names).size).toBe(3);
    expect(names[2]).toBe('Бондаренко Марія Олексіївна (3).xlsx');
  });

  it('replaces characters Windows forbids', () => {
    expect(ratingFileNames(['Іванов/Петров Іван*Ігорович'])).toEqual([
      'Іванов Петров Іван Ігорович.xlsx',
    ]);
  });

  it('falls back to a placeholder for an empty name', () => {
    expect(ratingFileNames(['   '])).toEqual(['Без імені.xlsx']);
  });

  it('returns one name per input, in order', () => {
    expect(ratingFileNames(['В', 'Б', 'А'])).toEqual(['В.xlsx', 'Б.xlsx', 'А.xlsx']);
  });
});

// Shaped like the parsed DB rows the export route passes in: item number and
// field specs come off the ActivityType row, and the option points with them.
const types: ExportActivityType[] = [
  {
    code: 'pedagogical_experience',
    label: 'Науково-педагогічний стаж',
    itemNumber: '1.1',
    coefficient: 1,
    coefficientNote: '1 бал за рік',
    sectionNumber: 1,
    sectionTitle: 'Показники професійного розвитку цього року',
    fields: [{ kind: 'number', name: 'value', label: 'Стаж (років)', min: 0, int: true }],
    divisionKey: 'KADRY',
  },
  {
    code: 'ndr_execution',
    label: 'Виконання НДР',
    itemNumber: '3.4',
    coefficient: 1,
    coefficientNote: 'керівник — 300, виконавець — 200',
    sectionNumber: 3,
    sectionTitle: 'Наука цього року',
    fields: [
      {
        kind: 'select',
        name: 'option',
        label: 'Роль',
        options: [
          { value: 'leader', label: 'керівник', points: 300 },
          { value: 'executor', label: 'виконавець', points: 200 },
        ],
      },
      { kind: 'text', name: 'title', label: 'Тема НДР' },
    ],
    divisionKey: 'NNV',
  },
];

const staff = {
  fullName: 'Коваленко Іван Петрович',
  department: "Кафедра комп'ютерних наук",
  year: 2026,
  activities: [
    { code: 'pedagogical_experience', score: 17, option: null },
    { code: 'ndr_execution', score: 300, option: 'leader' },
  ],
};

function cellValues(ws: import('exceljs').Worksheet): string[][] {
  const rows: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell) => {
      const v = cell.value;
      if (v && typeof v === 'object' && 'formula' in v) cells.push(`=${v.formula}`);
      else cells.push(v === null || v === undefined ? '' : String(v));
    });
    rows.push(cells);
  });
  return rows;
}

describe('buildRatingWorkbook', () => {
  const wb = buildRatingWorkbook(staff, types);
  const ws = wb.getWorksheet('Рейтинг')!;
  const rows = cellValues(ws);
  const flat = rows.map((r) => r.join('|'));

  it('renders the official header block', () => {
    expect(flat.some((r) => r.includes('ТАБЛИЦЯ РЕЙТИНГОВОГО ОЦІНЮВАННЯ'))).toBe(true);
    expect(flat.some((r) => r.includes('УНІВЕРСИТЕТУ ЗА') && r.includes('2026'))).toBe(true);
    expect(flat.some((r) => r.includes('Кафедра') && r.includes("комп'ютерних наук"))).toBe(true);
    expect(flat.some((r) => r.includes('Коваленко Іван Петрович'))).toBe(true);
  });

  // The sheet is the official form for ONE year, so its band headings come from
  // that year's own RatingSection rows — the SECTION_TITLES constant is only a
  // fallback. Both fixture titles are deliberately unlike the constant.
  it('bands each розділ under the year’s own heading', () => {
    expect(flat.some((r) => r.includes('Показники професійного розвитку цього року'))).toBe(true);
    expect(flat.some((r) => r.includes('Наука цього року'))).toBe(true);
  });

  it('renders a plain indicator with its earned score and division', () => {
    const row = rows.find((r) => r[1] === 'Науково-педагогічний стаж')!;
    expect(row[0]).toBe('1.1.');
    expect(row[2]).toBe('1');
    expect(row[4]).toBe('17');
    expect(row[5]).toBe('Відділ кадрів');
  });

  it('renders a grouped indicator: option rows with points, score on the earned option', () => {
    const header = rows.find((r) => r[1] === 'Виконання НДР:');
    expect(header).toBeDefined();
    const leader = rows.find((r) => r[1] === 'керівник')!;
    expect(leader[2]).toBe('300');
    expect(leader[4]).toBe('300');
    expect(leader[5]).toBe('ННВ');
    const executor = rows.find((r) => r[1] === 'виконавець')!;
    expect(executor[4]).toBe('');
  });

  it('adds section totals and a grand total with SUM formulas', () => {
    expect(flat.filter((r) => r.includes('Всього балів по розділу'))).toHaveLength(2);
    const grand = rows.find((r) => r[0] === 'Загальна сума балів')!;
    expect(grand[4].startsWith('=SUM(')).toBe(true);
  });
});
