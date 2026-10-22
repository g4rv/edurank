import { describe, expect, it } from 'vitest';
import type { ReportDepartment } from '@/lib/queries/get-rating-chart';
import type { DepartmentReportRow } from '@/lib/queries/list-department-reports';
import type { TopStaffRow } from '@/lib/dashboard/top-staff';
import { barPercent, departmentRows, reportRows, staffRows, topStaffRows } from './ranking';

const dept = (id: string, name: string, avgTotal: number, s1 = 0): ReportDepartment => ({
  id,
  name,
  faculty: 'Факультет',
  nppCount: 2,
  avgSections: [s1, 0, 0, 0, 0],
  avgTotal,
  staff: [
    { name: 'Б Б Б', sections: [s1, 0, 0, 0, 0], total: avgTotal },
    { name: 'А А А', sections: [s1 + 1, 0, 0, 0, 0], total: avgTotal + 5 },
  ],
});

describe('barPercent', () => {
  it('is the share of the longest, kept inside 0–100', () => {
    expect(barPercent(50, 200)).toBe(25);
    expect(barPercent(300, 200)).toBe(100);
    expect(barPercent(-4, 200)).toBe(0);
  });
  it('is 0 when nothing can be compared', () => {
    expect(barPercent(10, 0)).toBe(0);
    expect(barPercent(0, 100)).toBe(0);
  });
});

describe('departmentRows', () => {
  const list = [dept('a', 'Кафедра економіки', 100, 7), dept('b', 'Кафедра менеджменту', 300, 1)];

  it('ranks by the chosen показник and drops the word «Кафедра»', () => {
    const rows = departmentRows(list, null);
    expect(rows.map((r) => [r.rank, r.name, r.value])).toEqual([
      [1, 'менеджменту', 300],
      [2, 'економіки', 100],
    ]);
    expect(rows[0].sub).toBe('Факультет');
  });

  it('ranks by a розділ when one is chosen', () => {
    expect(departmentRows(list, 0).map((r) => r.name)).toEqual(['економіки', 'менеджменту']);
  });
});

describe('staffRows', () => {
  it('pairs a розділ with the total, and shows only the total otherwise', () => {
    const d = dept('a', 'Кафедра економіки', 100, 7);
    expect(staffRows(d, null)[0].second).toBeUndefined();
    const paired = staffRows(d, 0);
    expect(paired[0]).toMatchObject({ name: 'А А А', value: 8, second: 105, rank: 1 });
  });
});

describe('a tie on the chosen показник', () => {
  it('puts the person with the greater total higher, as the PDF does', () => {
    const d: ReportDepartment = {
      ...dept('a', 'Кафедра економіки', 100),
      staff: [
        { name: 'Банар', sections: [0, 0, 650, 0, 0], total: 829 },
        { name: 'Тестенко', sections: [0, 0, 650, 0, 0], total: 660 },
        { name: 'Авраменко', sections: [0, 0, 650, 0, 0], total: 700 },
      ],
    };
    expect(staffRows(d, 2).map((r) => r.name)).toEqual(['Банар', 'Авраменко', 'Тестенко']);
  });

  it('does the same for кафедри level on a розділ', () => {
    const rows = departmentRows(
      [dept('a', 'Кафедра А', 100, 5), dept('b', 'Кафедра Б', 300, 5)],
      0
    );
    expect(rows.map((r) => r.name)).toEqual(['Б', 'А']);
  });
});

describe('reportRows', () => {
  const row = (id: string, name: string, totalScore: number | null): DepartmentReportRow => ({
    id,
    name,
    faculty: 'Ф',
    facultyId: 'f',
    totalScore,
    updatedAt: null,
  });

  it('ranks filled reports by total and puts the unfilled last, unranked', () => {
    const rows = reportRows([
      row('x', 'Кафедра Ї', null),
      row('a', 'Кафедра А', 40),
      row('b', 'Кафедра Б', 90),
    ]);
    expect(rows.map((r) => [r.rank, r.name])).toEqual([
      [1, 'Б'],
      [2, 'А'],
      [null, 'Ї'],
    ]);
    expect(rows[2]).toMatchObject({ empty: true, note: 'Не заповнено' });
  });

  it('does not rank a кафедра that scored a real zero below one with no report', () => {
    const rows = reportRows([row('x', 'Кафедра Ї', null), row('z', 'Кафедра Я', 0)]);
    expect(rows[0]).toMatchObject({ name: 'Я', rank: 1 });
  });
});

describe('topStaffRows', () => {
  const p = (id: string, name: string, value: number, total: number): TopStaffRow => ({
    id,
    name,
    department: 'Кафедра економіки',
    faculty: 'Факультет',
    value,
    total,
  });

  it('ranks by the розділ, the greater total first on a tie, and names the кафедра', () => {
    const rows = topStaffRows(
      [p('a', 'Тестенко', 650, 660), p('b', 'Банар', 650, 829), p('c', 'Лис', 700, 700)],
      true
    );
    expect(rows.map((r) => [r.rank, r.name, r.value, r.second])).toEqual([
      [1, 'Лис', 700, 700],
      [2, 'Банар', 650, 829],
      [3, 'Тестенко', 650, 660],
    ]);
    expect(rows[0].sub).toBe('економіки · Факультет');
  });

  it('leaves the line out for somebody with no кафедра at all', () => {
    const rows = topStaffRows([{ ...p('a', 'Лис', 1, 1), department: null, faculty: null }], true);
    expect(rows[0].sub).toBeUndefined();
  });

  it('carries no second bar when the показник is the total itself', () => {
    const rows = topStaffRows([p('a', 'Лис', 5, 5)], false);
    expect(rows[0].second).toBeUndefined();
  });
});
