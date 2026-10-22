import { describe, expect, it } from 'vitest';
import type { ReportDepartment } from '@/lib/queries/get-rating-chart';
import type { DepartmentReportRow } from '@/lib/queries/list-department-reports';
import {
  departmentsWorkbook,
  reportsWorkbook,
  staffWorkbook,
  topStaffWorkbook,
} from './ranking-workbook';

const dept = (id: string, name: string, avgTotal: number): ReportDepartment => ({
  id,
  name,
  faculty: 'Факультет',
  nppCount: 2,
  avgSections: [1, 2, 3, 4, 5],
  avgTotal,
  staff: [
    { name: 'Б Б Б', sections: [1, 0, 0, 0, 0], total: 10 },
    { name: 'А А А', sections: [2, 0, 0, 0, 0], total: 30 },
  ],
});

/** A row's cells from the header down, as plain values */
const body = (wb: ReturnType<typeof departmentsWorkbook>) => {
  const ws = wb.worksheets[0];
  const rows: unknown[][] = [];
  ws.eachRow((row, n) => {
    if (n >= 4) rows.push((row.values as unknown[]).slice(1));
  });
  return rows;
};

describe('departmentsWorkbook', () => {
  it('ranks кафедри by the average, highest first, with the розділи beside it', () => {
    const wb = departmentsWorkbook(2026, [
      dept('a', 'Кафедра економіки', 100),
      dept('b', 'Кафедра менеджменту', 300),
    ]);
    expect(body(wb)).toEqual([
      [1, 'Кафедра менеджменту', 'Факультет', 2, 300, 1, 2, 3, 4, 5],
      [2, 'Кафедра економіки', 'Факультет', 2, 100, 1, 2, 3, 4, 5],
    ]);
    expect(wb.worksheets[0].getCell('A1').value).toContain('2026');
  });
});

describe('staffWorkbook', () => {
  it('lists one кафедра’s НПП, highest total first', () => {
    const wb = staffWorkbook(2026, dept('a', 'Кафедра економіки', 100));
    expect(body(wb).map((r) => [r[0], r[1], r[2]])).toEqual([
      [1, 'А А А', 30],
      [2, 'Б Б Б', 10],
    ]);
  });
});

describe('reportsWorkbook', () => {
  const row = (id: string, name: string, totalScore: number | null): DepartmentReportRow => ({
    id,
    name,
    faculty: 'Ф',
    facultyId: 'f',
    totalScore,
    updatedAt: null,
  });

  it('ranks the filled reports and lists a кафедра with none last, unranked', () => {
    const wb = reportsWorkbook(2026, [
      row('x', 'Кафедра Ї', null),
      row('a', 'Кафедра А', 40),
      row('b', 'Кафедра Б', 90),
    ]);
    expect(body(wb).map((r) => [r[0] ?? null, r[1], r[3] ?? null, r[4]])).toEqual([
      [1, 'Кафедра Б', 90, 'Заповнено'],
      [2, 'Кафедра А', 40, 'Заповнено'],
      [null, 'Кафедра Ї', null, 'Не заповнено'],
    ]);
  });
});

describe('topStaffWorkbook', () => {
  const top = [
    {
      id: 'a',
      name: 'А А А',
      department: 'Кафедра економіки',
      faculty: 'Ф',
      value: 650,
      total: 829,
    },
    { id: 'b', name: 'Б Б Б', department: null, faculty: null, value: 640, total: 700 },
  ];

  it('lists the people with their кафедра, and the total beside a розділ', () => {
    const wb = topStaffWorkbook(2026, 'Розділ 3', top, true);
    expect(body(wb)).toEqual([
      [1, 'А А А', 'Кафедра економіки', 'Ф', 650, 829],
      [2, 'Б Б Б', undefined, undefined, 640, 700],
    ]);
  });

  it('has one score column when the показник is the total itself', () => {
    const wb = topStaffWorkbook(2026, 'Загальний бал', top, false);
    expect(body(wb)[0]).toEqual([1, 'А А А', 'Кафедра економіки', 'Ф', 650]);
    expect(wb.worksheets[0].getCell('E3').value).toBe('Загальний бал');
  });
});
