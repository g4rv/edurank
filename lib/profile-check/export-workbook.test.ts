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
