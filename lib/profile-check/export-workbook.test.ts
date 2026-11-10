import { describe, expect, it } from 'vitest';
import { buildProfileChecksWorkbook, checkText } from './export-workbook';
import type { Check } from './types';
import type { ProfileCheckRow } from '@/lib/queries/list-profile-checks';

const chk = (
  field: string,
  status: Check['status'],
  message: string | null,
  current: unknown = null
): Check => ({
  field,
  current,
  shouldBe: '',
  status,
  message,
});

const none = { orcid: null, wos: null, scopus: null, googleScholar: null };

function person(name: string, over: Partial<ProfileCheckRow>): ProfileCheckRow {
  return {
    staffId: name,
    name,
    faculty: 'Ф1',
    department: 'К1',
    cells: {},
    links: none,
    problem: false,
    problemPlatforms: [],
    ...over,
  };
}

const cell = (status: 'ok' | 'error', checks: Check[]) => ({
  status,
  link: 'https://orcid.org/0000-0000-0000-0001',
  error: null,
  checks,
  checkedAt: '2026-11-09T00:00:00.000Z',
});

const rows = [
  person('Bad', {
    cells: {
      orcid: cell('error', [
        chk('name', 'error', 'Ім’я не латиницею', 'Іван'),
        chk('keywords', 'ok', null, ['a']),
      ]),
    },
    problem: true,
    problemPlatforms: ['orcid'],
  }),
  person('Advice', {
    cells: {
      orcid: cell('ok', [
        chk('name', 'ok', null, 'Ann'),
        chk('keywords', 'info', 'Додайте ключові слова'),
      ]),
    },
  }),
  person('NoLink', {}),
];

const argb = (c: { fill?: unknown }) =>
  (c.fill as { fgColor?: { argb?: string } } | undefined)?.fgColor?.argb ?? null;

describe('buildProfileChecksWorkbook', () => {
  it('has a sheet per platform', () => {
    const wb = buildProfileChecksWorkbook(rows, { grouped: true, onlyProblems: false });
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      'ORCID',
      'Web of Science',
      'Scopus',
      'Google Scholar',
    ]);
  });

  it('colours: error red, advice green, no link white', () => {
    const ws = buildProfileChecksWorkbook(rows, {
      grouped: false,
      onlyProblems: false,
    }).getWorksheet('ORCID')!;
    // flat: НПП | Факультет | Кафедра | Статус | Посилання | Ім'я | Ключові слова
    expect(ws.getRow(1).values).toContain("Ім'я");
    const byName = (n: string) =>
      ws.getRows(2, ws.rowCount)!.find((r) => r.getCell(1).value === n)!;
    const bad = byName('Bad');
    expect(argb(bad.getCell(1))).toBe('FFF8C9C9');
    expect(argb(bad.getCell(6))).toBe('FFF8C9C9');
    expect(bad.getCell(6).value).toContain('Зараз: Іван');
    expect(argb(bad.getCell(7))).toBe('FFD3EDD6');
    const advice = byName('Advice');
    expect(argb(advice.getCell(1))).toBe('FFD3EDD6');
    expect(argb(advice.getCell(7))).toBe('FFFBE6A6');
    const nolink = byName('NoLink');
    expect(argb(nolink.getCell(1))).toBe('FFE2E2E2');
    expect(argb(nolink.getCell(7))).toBe('FFE2E2E2');
    expect(nolink.getCell(4).value).toBeNull();
    expect(nolink.alignment?.vertical).toBe('middle');
  });

  it('sorts: all fine, advice, error, no profile', () => {
    const ws = buildProfileChecksWorkbook(
      [
        rows[2],
        rows[0],
        rows[1],
        person('Fine', { cells: { orcid: cell('ok', [chk('name', 'ok', null, 'A')]) } }),
      ],
      { grouped: false, onlyProblems: false }
    ).getWorksheet('ORCID')!;
    const names = [2, 3, 4, 5].map((i) => ws.getRow(i).getCell(1).value);
    expect(names).toEqual(['Fine', 'Advice', 'Bad', 'NoLink']);
  });

  it('groups by faculty and кафедра with no filter', () => {
    const ws = buildProfileChecksWorkbook(rows, {
      grouped: true,
      onlyProblems: false,
    }).getWorksheet('ORCID')!;
    expect(ws.getCell('A2').value).toBe('Ф1');
    expect(ws.getCell('A3').value).toBe('К1');
  });

  it('only problems keeps who has one, on every sheet', () => {
    const ws = buildProfileChecksWorkbook(rows, {
      grouped: false,
      onlyProblems: true,
    }).getWorksheet('ORCID')!;
    expect(ws.rowCount).toBe(2);
  });
});

describe('checkText', () => {
  it('shows a metric with its recent value', () => {
    expect(checkText(chk('h_index', 'ok', null, { all: 10, recent: 6 }))).toBe(
      '10 (за 5 років: 6)'
    );
  });
});

describe('grouped layout', () => {
  const two = [
    person('A1', { faculty: 'Ф1', department: 'К1' }),
    person('A2', { faculty: 'Ф1', department: 'К2' }),
    person('B1', { faculty: 'Ф2', department: 'К3' }),
  ];

  it('leaves 1 blank row after a кафедра and 3 after a факультет', () => {
    const ws = buildProfileChecksWorkbook(two, { grouped: true, onlyProblems: false }).getWorksheet(
      'ORCID'
    )!;
    const col = [...Array(ws.rowCount - 1)].map((_, i) => ws.getRow(i + 2).getCell(1).value ?? '');
    expect(col).toEqual(['Ф1', 'К1', 'A1', '', 'К2', 'A2', '', '', '', 'Ф2', 'К3', 'B1']);
  });

  it('makes the headings taller and bigger: факультет 22, кафедра 16.5', () => {
    const ws = buildProfileChecksWorkbook(two, { grouped: true, onlyProblems: false }).getWorksheet(
      'ORCID'
    )!;
    expect(ws.getRow(2).font?.size).toBe(22);
    expect(ws.getRow(3).font?.size).toBe(16.5);
    expect(ws.getRow(2).height).toBeGreaterThan(ws.getRow(3).height!);
  });

  it('a bare sheet has the name column first and no place columns or headings', () => {
    const ws = buildProfileChecksWorkbook(two, {
      grouped: false,
      bare: true,
      onlyProblems: false,
    }).getWorksheet('ORCID')!;
    expect(ws.getRow(1).getCell(2).value).toBe('Статус');
    expect(ws.getRow(2).getCell(1).value).toBe('A1');
  });
});

describe('a stored «no link»', () => {
  it('is a gray row like any person with no profile, not a white one with a note', () => {
    const stale = person('Stale', {
      cells: {
        orcid: { status: 'no_link', link: null, error: null, checks: [], checkedAt: '2026-11-01' },
      },
    });
    const ws = buildProfileChecksWorkbook([stale], {
      grouped: false,
      onlyProblems: false,
    }).getWorksheet('ORCID')!;
    expect(argb(ws.getRow(2).getCell(1))).toBe('FFE2E2E2');
    expect(ws.getRow(2).getCell(4).value).toBeNull();
  });

  it('says «Не перевіряли» when a link was added since', () => {
    const added = person('Added', {
      links: { ...none, orcid: '0000-0000-0000-0001' },
      cells: {
        orcid: { status: 'no_link', link: null, error: null, checks: [], checkedAt: '2026-11-01' },
      },
    });
    const ws = buildProfileChecksWorkbook([added], {
      grouped: false,
      onlyProblems: false,
    }).getWorksheet('ORCID')!;
    expect(ws.getRow(2).getCell(4).value).toBe('Не перевіряли');
  });
});
