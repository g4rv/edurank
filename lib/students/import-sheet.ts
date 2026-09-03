import ExcelJS from 'exceljs';

// The only place a spreadsheet is opened. Everything downstream sees plain
// strings, which is what keeps `lib/students/import.ts` free of exceljs — that
// module is imported from ordinary shared code, and dragging a spreadsheet
// library into a client bundle for one helper would be absurd.
//
// SERVER ONLY, by convention rather than by the `server-only` package, which
// this project does not depend on: the sole caller is a `'use server'` action.
// Do not import this from a component.

/** How many data rows one file may carry. A наказ is hundreds, not millions. */
export const MAX_IMPORT_ROWS = 5000;

export class SheetError extends Error {}

/**
 * A worksheet as rows of trimmed text, header row first.
 *
 * `.xlsx` only. The `.xls` the деканат's older exports use is a completely
 * different binary format that exceljs cannot open, and adding a second library
 * for a format Microsoft replaced in 2007 is not worth an image that much
 * bigger — «Збережіть файл як .xlsx» is two clicks in Excel.
 *
 * `cell.text` rather than `cell.value`: a value may be rich text, a formula
 * result or a hyperlink object, and every one of those stringifies into
 * something nobody typed.
 */
export async function readSheet(buffer: ArrayBuffer): Promise<string[][]> {
  const workbook = new ExcelJS.Workbook();

  try {
    await workbook.xlsx.load(buffer);
  } catch {
    // Deliberately not logged as an error: a person picking the wrong file is
    // not a defect, and the message already tells them what to do.
    throw new SheetError(
      'Не вдалося прочитати файл. Переконайтеся, що це .xlsx — старий .xls треба зберегти заново.'
    );
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) throw new SheetError('У файлі немає жодного аркуша');

  if (sheet.rowCount > MAX_IMPORT_ROWS) {
    throw new SheetError(`Забагато рядків: ${sheet.rowCount}. Максимум ${MAX_IMPORT_ROWS}.`);
  }

  const width = sheet.columnCount;
  const rows: string[][] = [];

  for (let r = 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const cells: string[] = [];
    for (let c = 1; c <= width; c++) cells.push(row.getCell(c).text.trim());
    rows.push(cells);
  }

  return rows;
}
