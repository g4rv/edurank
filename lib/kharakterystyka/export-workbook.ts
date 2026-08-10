import ExcelJS from 'exceljs';
import { REQUIRED_POSITIONS } from './positions';
import type { Kharakterystyka } from './build';

// Replicates the document the university types by hand — the layout is taken
// from a real filled one, `edu-reference/csv/… - Характеристика_РНПАВ.csv`:
//
//   Характеристика
//   рівня наукової та професійної активності викладача за останні 5 років (2021–2025)
//   № з/п | Показник активності | Дані підтвердження показника
//
// Three columns, twenty rows, and the evidence cell holding the entries one
// under another separated by a blank line. That is followed here exactly,
// because the sheet is read against п.38 of the Ліцензійні умови and a
// rearranged version is harder for them to check, not easier.

const THIN = { style: 'thin' as const };
const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFD9D9D9' },
};

export interface KharakterystykaExportStaff {
  fullName: string;
  department: string;
  /** «доцент, кандидат педагогічних наук» — empty when neither is recorded */
  academicTitle: string;
}

/**
 * The document for one person.
 *
 * Every position appears, met or not — the reader is checking a twenty-item
 * law, so a sheet that silently omitted the empty ones would be unusable for
 * the job it exists to do.
 */
export function buildKharakterystykaWorkbook(
  staff: KharakterystykaExportStaff,
  data: Kharakterystyka
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Характеристика');

  ws.columns = [{ width: 7 }, { width: 62 }, { width: 75 }];

  // ── Header block, wording verbatim from the reference document ──
  const title = ws.addRow(['Характеристика']);
  ws.mergeCells(`A${title.number}:C${title.number}`);
  title.getCell(1).font = { bold: true, size: 14 };
  title.getCell(1).alignment = { horizontal: 'center' };

  const subtitle = ws.addRow([
    `рівня наукової та професійної активності викладача за останні 5 років (${data.from}–${data.to})`,
  ]);
  ws.mergeCells(`A${subtitle.number}:C${subtitle.number}`);
  subtitle.getCell(1).font = { bold: true, size: 11 };
  subtitle.getCell(1).alignment = { horizontal: 'center', wrapText: true };

  // Not in the reference sheet — there, the person is identified by the file
  // name alone, which is fine inside their own workbook and lost the moment a
  // single sheet is printed or emailed on its own.
  const person = ws.addRow([staff.fullName]);
  ws.mergeCells(`A${person.number}:C${person.number}`);
  person.getCell(1).font = { bold: true, size: 11 };
  person.getCell(1).alignment = { horizontal: 'center' };

  const details = [staff.academicTitle, staff.department].filter(Boolean).join(', ');
  if (details) {
    const sub = ws.addRow([details]);
    ws.mergeCells(`A${sub.number}:C${sub.number}`);
    sub.getCell(1).font = { size: 10 };
    sub.getCell(1).alignment = { horizontal: 'center', wrapText: true };
  }

  ws.addRow([]);

  // ── Table ──
  const header = ws.addRow(['№ з/п', 'Показник активності', 'Дані підтвердження показника']);
  header.eachCell({ includeEmpty: true }, (cell, col) => {
    if (col > 3) return;
    cell.font = { bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = BORDER;
    cell.fill = HEADER_FILL;
  });
  header.height = 30;

  for (const position of data.positions) {
    const row = ws.addRow([position.number, position.title, position.evidence]);

    row.getCell(1).alignment = { horizontal: 'center', vertical: 'top' };
    row.getCell(2).alignment = { vertical: 'top', wrapText: true };
    // The evidence column holds several entries separated by a blank line, so
    // it must wrap; without an explicit row height Excel sizes a wrapped cell
    // to one line and the rest is invisible until the user drags it open.
    row.getCell(3).alignment = { vertical: 'top', wrapText: true };

    for (let col = 1; col <= 3; col++) row.getCell(col).border = BORDER;

    // Roughly one line per ~90 characters of the widest cell, bounded so a
    // person with twelve publications does not produce a page-tall row.
    const lines = Math.max(
      position.title.length / 90,
      position.evidence ? position.evidence.split('\n').length : 1
    );
    row.height = Math.min(Math.max(30, lines * 14), 320);
  }

  ws.addRow([]);

  // The count is not decoration: додаток 3 of the ставка положення has a column
  // «Досягнення у професійній діяльності (позицій із 20)», and ≥4 is what makes
  // a person part of Кнпп in the formula. Whoever prints this needs the number.
  const total = ws.addRow([
    '',
    'Разом виконано позицій',
    `${data.metCount} з ${data.positions.length}` +
      (data.qualifies ? '' : ` (потрібно щонайменше ${REQUIRED_POSITIONS})`),
  ]);
  total.getCell(2).font = { bold: true };
  total.getCell(3).font = { bold: true };
  total.getCell(2).alignment = { horizontal: 'right' };
  for (let col = 2; col <= 3; col++) total.getCell(col).border = BORDER;

  return wb;
}
