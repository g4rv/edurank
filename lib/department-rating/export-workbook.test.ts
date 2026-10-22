import { describe, expect, it } from 'vitest';
import type ExcelJS from 'exceljs';
import { EMPTY_NARRATIVE, IMPACT_KINDS } from '@/validations/department-report';
import { buildDepartmentReportWorkbook } from './export-workbook';
import type { IndicatorRow } from './score';

const indicators: IndicatorRow[] = [
  {
    id: 'h',
    itemNumber: '1',
    label: 'Гранти',
    kind: 'HEADING',
    coefficient: 0,
    options: [],
    isActive: true,
  },
  {
    id: 'c',
    itemNumber: '1.1',
    label: 'Горизонт',
    kind: 'COUNT',
    coefficient: 50,
    options: [],
    isActive: true,
  },
  {
    id: 's',
    itemNumber: '3',
    label: 'Платні послуги',
    kind: 'CHOICE',
    coefficient: 0,
    options: [{ label: '0-10 тис. грн.', points: 10 }],
    isActive: true,
  },
];

function build() {
  return buildDepartmentReportWorkbook({
    departmentName: 'Кафедра історії',
    year: 2026,
    indicators,
    values: { c: 3, s: 0 },
    narrative: {
      ...EMPTY_NARRATIVE,
      impact: { ...EMPTY_NARRATIVE.impact, kind: IMPACT_KINDS[6] },
    },
    total: 160,
  });
}

/** Every row's cells as plain values, for finding things without fixing their address */
function rowsOf(ws: ExcelJS.Worksheet) {
  const rows: unknown[][] = [];
  ws.eachRow((row) => rows.push((row.values as unknown[]).slice(1)));
  return rows;
}

describe('buildDepartmentReportWorkbook', () => {
  it('heads the sheet with the year and the кафедра', () => {
    const ws = build().worksheets[0];
    expect(ws.getCell('A2').value).toBe('Звіт за 2026 календарний рік');
    expect(ws.getCell('C4').value).toBe('Кафедра історії');
    expect(ws.getCell('C6').value).toEqual({ formula: 'E10+E11', result: 160 });
  });

  it('heads the columns as the template does, with «Коефіцієнт»', () => {
    const ws = build().worksheets[0];
    expect((ws.getRow(8).values as unknown[]).slice(1, 6)).toEqual([
      undefined, // the template's A8 is blank
      'Назва критерію',
      'К-сть',
      'Коефіцієнт',
      'Бал',
    ]);
  });

  it('writes the item number as text, so Excel cannot turn 1.1 into a date', () => {
    const ws = build().worksheets[0];
    const row = rowsOf(ws).find((r) => r[0] === '1.1');
    expect(row).toBeDefined();
    expect(typeof row![0]).toBe('string');
    // К-сть, ціна, бал — the score is the template's own formula, its result stored beside it
    expect(row!.slice(2, 4)).toEqual([3, 50]);
    expect(row![4]).toEqual({ formula: 'IF(C10>0,C10*D10,0)', result: 150 });
  });

  it('prints a choice by its label', () => {
    const ws = build().worksheets[0];
    const row = rowsOf(ws).find((r) => r[0] === '3');
    expect(row![2]).toBe('0-10 тис. грн.');
    expect(row![4]).toEqual({ formula: 'IF(C11="0-10 тис. грн.",10,0)', result: 10 });
  });

  it('frames the form like the template: Montserrat, green where somebody types', () => {
    const ws = build().worksheets[0];
    expect(ws.getCell('C10').font?.name).toBe('Montserrat');
    expect(ws.getCell('C10').fill).toMatchObject({ fgColor: { argb: 'FF00FF00' } });
    expect(ws.getCell('C10').border?.top?.style).toBe('medium');
    expect(ws.getCell('C6').fill).toMatchObject({ fgColor: { argb: 'FFFCE5CD' } });
  });

  it('keeps items 14–17 in the template frames: three lines of 14, two studies of 15', () => {
    const ws = build().worksheets[0];
    const labels = rowsOf(ws).map((r) => r[0]);
    for (const n of [
      '14',
      '14.1',
      '14.2',
      '14.3',
      '15',
      '15.1',
      '15.2',
      '16',
      '17',
      '17.1',
      '17.6',
    ])
      expect(labels).toContain(n);
  });

  it('carries the narrative, with the chosen kind of impact', () => {
    const ws = build().worksheets[0];
    const cells = rowsOf(ws).flat();
    expect(cells).toContain(IMPACT_KINDS[6]);
  });
});
