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

// Column widths, in Excel's own unit — roughly how many characters of the
// default font fit. Named because the row-height maths has to divide by exactly
// these: the two drifting apart is what clipped half the document (owner,
// 2026-09-01), and nothing in a spreadsheet warns you that a cell is cut off.
const COL_NUMBER = 7;
const COL_TITLE = 62;
const COL_EVIDENCE = 75;

/** Points one wrapped line occupies at the default 11pt font */
const LINE_HEIGHT = 15;
/** Excel refuses anything taller; past this a cell genuinely cannot be shown */
const MAX_ROW_HEIGHT = 409;

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
 * How many lines a wrapped cell takes in a column of this width.
 *
 * Counting newlines alone is what hid most of this document: the evidence
 * column holds whole publication references, and one of those wraps four or
 * five times inside 75 characters while counting as a single line. Excel gives
 * no hint that a row is too short — the text is simply not there, and whoever
 * prints it cannot know what is missing.
 *
 * Excel breaks on WORDS, so `length / width` is not enough either: it assumes
 * every line packs to its last character, and a real one stops at whatever word
 * would have crossed the edge. That is worth about one line per paragraph —
 * which is exactly how much was still being cut off every publication (owner,
 * 2026-09-01). The greedy pass below is the same rule Excel applies.
 *
 * A word longer than the column — a DOI link, and every reference here has one —
 * cannot break on a space, so it spills character by character.
 */
function wrappedLines(text: string, columnWidth: number): number {
  if (!text) return 1;
  // Two characters for the cell's own padding
  const perLine = Math.max(1, columnWidth - 2);
  let lines = 0;

  for (const paragraph of text.split('\n')) {
    // A blank separator still occupies its line
    if (!paragraph.trim()) {
      lines += 1;
      continue;
    }

    let used = 0;
    let count = 1;
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (used === 0) used = word.length;
      else if (used + 1 + word.length <= perLine) used += 1 + word.length;
      else {
        count += 1;
        used = word.length;
      }
      // Whatever a too-long word could not fit carries onto further lines
      while (used > perLine) {
        count += 1;
        used -= perLine;
      }
    }
    lines += count;
  }

  return lines;
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

  ws.columns = [{ width: COL_NUMBER }, { width: COL_TITLE }, { width: COL_EVIDENCE }];

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
    // ONE ROW PER ENTRY, with № and the показник merged down the side of them.
    //
    // The whole position used to be one row, and Excel will not make a row
    // taller than 409 points — about 27 lines. Somebody with twelve publications
    // needs a hundred, so two thirds of п.1 was simply invisible, with nothing
    // on the sheet to say so (owner, 2026-09-01). Split across rows each entry
    // gets the height it actually needs, and the document still reads as the
    // twenty positions of п.38.
    const cells = position.entries.length > 0 ? position.entries : [null];
    const first = ws.rowCount + 1;

    for (const entry of cells) {
      const text = entry ? `${entry.summary} (${entry.year})` : '';
      const row = ws.addRow([entry === position.entries[0] ? position.number : null, null, text]);

      row.getCell(1).alignment = { horizontal: 'center', vertical: 'top' };
      row.getCell(2).alignment = { vertical: 'top', wrapText: true };
      // Without an explicit height Excel sizes a wrapped cell to one line and
      // the rest is invisible until somebody drags it open.
      row.getCell(3).alignment = { vertical: 'top', wrapText: true };
      for (let col = 1; col <= 3; col++) row.getCell(col).border = BORDER;

      // One spare line on top of the estimate. Excel measures in the font's own
      // metrics and this counts characters, so the two can disagree by a little
      // — and the two outcomes are not equally bad: a row a line too tall is
      // merely a gap, a row a line too short silently drops evidence.
      row.height = Math.min(
        (Math.max(2, wrappedLines(text, COL_EVIDENCE)) + 1) * LINE_HEIGHT,
        MAX_ROW_HEIGHT
      );
    }

    const last = ws.rowCount;
    if (last > first) {
      ws.mergeCells(`A${first}:A${last}`);
      ws.mergeCells(`B${first}:B${last}`);
    }
    // Written after the merge: ExcelJS keeps the top-left cell's value, and
    // assigning before merging loses it on every row but the first.
    ws.getCell(`A${first}`).value = position.number;
    ws.getCell(`B${first}`).value = position.title;
    ws.getCell(`A${first}`).alignment = { horizontal: 'center', vertical: 'top' };
    ws.getCell(`B${first}`).alignment = { vertical: 'top', wrapText: true };

    // The показник still has to fit beside however many entries there are. Its
    // own rows may add up to less than it needs — a one-line entry against a
    // ten-line title — so the shortfall goes onto the first row.
    const titleLines = wrappedLines(position.title, COL_TITLE);
    let have = 0;
    for (let n = first; n <= last; n++) have += (ws.getRow(n).height ?? LINE_HEIGHT) / LINE_HEIGHT;
    if (titleLines > have) {
      const row = ws.getRow(first);
      const grown = (row.height ?? LINE_HEIGHT) + (titleLines - have) * LINE_HEIGHT;
      row.height = Math.min(grown, MAX_ROW_HEIGHT);
    }
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
