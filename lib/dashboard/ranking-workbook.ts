import ExcelJS from 'exceljs';
import type { ReportDepartment } from '@/lib/queries/get-rating-chart';
import type { DepartmentReportRow } from '@/lib/queries/list-department-reports';
import { reportRows } from '@/lib/dashboard/ranking';
import type { TopStaffRow } from '@/lib/dashboard/top-staff';

// The dashboard's «Рейтинг кафедр» card as a spreadsheet. One sheet per call,
// the rows in the order the card shows them, so what is downloaded is what was
// on screen.

const SECTION_HEADS = ['Розділ 1', 'Розділ 2', 'Розділ 3', 'Розділ 4', 'Розділ 5'];

function sheet(title: string, columns: { header: string; width: number; numeric?: boolean }[]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Рейтинг');
  ws.columns = columns.map((c) => ({ width: c.width }));

  ws.mergeCells(1, 1, 1, columns.length);
  ws.getCell(1, 1).value = title;
  ws.getCell(1, 1).font = { bold: true, size: 14 };

  const head = ws.getRow(3);
  head.values = columns.map((c) => c.header);
  head.font = { bold: true };
  head.alignment = { vertical: 'middle', wrapText: true };
  head.eachCell((cell, col) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
    cell.border = { bottom: { style: 'medium', color: { argb: 'FF000000' } } };
    if (columns[col - 1]?.numeric) cell.alignment = { horizontal: 'right', wrapText: true };
  });
  ws.views = [{ state: 'frozen', ySplit: 3 }];
  return { wb, ws };
}

/** Every кафедра's average НПП score, total and by розділ, highest total first */
export function departmentsWorkbook(year: number, departments: ReportDepartment[]) {
  const { wb, ws } = sheet(`Рейтинг кафедр за ${year} рік — середній бал НПП`, [
    { header: '№', width: 6 },
    { header: 'Кафедра', width: 56 },
    { header: 'Факультет', width: 48 },
    { header: 'НПП', width: 8, numeric: true },
    { header: 'Загальний бал', width: 16, numeric: true },
    ...SECTION_HEADS.map((header) => ({ header, width: 12, numeric: true })),
  ]);

  const ordered = [...departments].sort(
    (a, b) => b.avgTotal - a.avgTotal || a.name.localeCompare(b.name, 'uk')
  );
  ordered.forEach((d, i) => {
    const row = ws.addRow([i + 1, d.name, d.faculty, d.nppCount, d.avgTotal, ...d.avgSections]);
    row.alignment = { vertical: 'top', wrapText: true };
    row.getCell(5).font = { bold: true };
  });
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: 5 + SECTION_HEADS.length } };
  return wb;
}

/** One кафедра's НПП, highest total first */
export function staffWorkbook(year: number, department: ReportDepartment) {
  const { wb, ws } = sheet(`${department.name} — рейтинг НПП за ${year} рік`, [
    { header: '№', width: 6 },
    { header: 'ПІБ', width: 48 },
    { header: 'Загальний бал', width: 16, numeric: true },
    ...SECTION_HEADS.map((header) => ({ header, width: 12, numeric: true })),
  ]);

  const ordered = [...department.staff].sort(
    (a, b) => b.total - a.total || a.name.localeCompare(b.name, 'uk')
  );
  ordered.forEach((s, i) => {
    const row = ws.addRow([i + 1, s.name, s.total, ...s.sections]);
    row.getCell(3).font = { bold: true };
  });
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: 3 + SECTION_HEADS.length } };
  return wb;
}

/** The кафедра-rating: ranked by the saved report's total; no report = no rank, listed last */
export function reportsWorkbook(year: number, reports: DepartmentReportRow[]) {
  const { wb, ws } = sheet(`Рейтинг кафедр за ${year} рік — за звітом кафедри`, [
    { header: '№', width: 6 },
    { header: 'Кафедра', width: 56 },
    { header: 'Факультет', width: 48 },
    { header: 'Всього', width: 12, numeric: true },
    { header: 'Звіт', width: 16 },
    { header: 'Оновлено', width: 14 },
  ]);

  const byId = new Map(reports.map((r) => [r.id, r]));
  for (const ranked of reportRows(reports)) {
    const source = byId.get(ranked.key);
    // The row's name has «Кафедра» cut for the card; the sheet wants it whole
    const row = ws.addRow([
      ranked.rank,
      source?.name ?? ranked.name,
      ranked.sub,
      ranked.empty ? null : ranked.value,
      ranked.empty ? 'Не заповнено' : 'Заповнено',
      source?.updatedAt ?? null,
    ]);
    row.getCell(6).numFmt = 'dd.mm.yyyy';
    row.alignment = { vertical: 'top', wrapText: true };
    row.getCell(4).font = { bold: true };
  }
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: 6 } };
  return wb;
}

/** The «Топ-20 НПП» for one показник — the rows the card shows, with the кафедра and факультет */
export function topStaffWorkbook(
  year: number,
  metricLabel: string,
  top: TopStaffRow[],
  paired: boolean
) {
  const { wb, ws } = sheet(`Топ-${top.length} НПП за ${year} рік — ${metricLabel}`, [
    { header: '№', width: 6 },
    { header: 'ПІБ', width: 48 },
    { header: 'Кафедра', width: 52 },
    { header: 'Факультет', width: 46 },
    { header: paired ? 'Бал за показником' : 'Загальний бал', width: 18, numeric: true },
    ...(paired ? [{ header: 'Загальний бал', width: 16, numeric: true }] : []),
  ]);

  top.forEach((p, i) => {
    const row = ws.addRow([
      i + 1,
      p.name,
      p.department,
      p.faculty,
      p.value,
      ...(paired ? [p.total] : []),
    ]);
    row.alignment = { vertical: 'top', wrapText: true };
    row.getCell(5).font = { bold: true };
  });
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: paired ? 6 : 5 } };
  return wb;
}
