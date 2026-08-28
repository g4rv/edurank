import ExcelJS from 'exceljs';

/**
 * The staff list as it stands on screen, as a spreadsheet.
 *
 * «Кількість» holds a single figure rather than a value per row: it is how many
 * people matched, not a property of any one of them. It sits in the LAST column
 * so the four columns describing a person read left to right without a total
 * cutting through the middle of them.
 *
 * Confidential fields are still out — ставка is ADMIN-read-only on screen and
 * has no business in a file that gets forwarded. What is here is what somebody
 * building a наказ or chasing invitations actually retypes.
 */

export interface StaffListRow {
  fullName: string;
  email: string | null;
  /** Has the person ever set a password. `undefined` when it was not queried. */
  isActivated: boolean | undefined;
  /** Their кафедра, or their відділ when they have no кафедра */
  department: string | null;
  /** Кафедри they hold a part-time post on, if any */
  partTimeDepartments: readonly string[];
}

const EMPTY = '—';

const THIN = {
  top: { style: 'thin' as const },
  left: { style: 'thin' as const },
  bottom: { style: 'thin' as const },
  right: { style: 'thin' as const },
};

/**
 * «Кафедра ботаніки + Кафедра екології» — the same thing the table's cell says.
 *
 * A person with no кафедра at all falls back to their відділ, which is how a
 * non-НПП is placed, and the caller has already resolved that into
 * `department`. The additional posts are named rather than badged: «where» is
 * the question this column answers, and «Сумісник» does not answer it.
 */
export function workplaceText(row: Pick<StaffListRow, 'department' | 'partTimeDepartments'>) {
  const primary = row.department ?? EMPTY;
  return row.partTimeDepartments.length > 0
    ? `${primary} + ${row.partTimeDepartments.join(' + ')}`
    : primary;
}

function activationText(isActivated: boolean | undefined): string {
  if (isActivated === undefined) return EMPTY;
  return isActivated ? 'Активований' : 'Не активований';
}

export function buildStaffListWorkbook(rows: readonly StaffListRow[]): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();
  const sheet = wb.addWorksheet('Персонал');

  sheet.columns = [
    { key: 'name', width: 40 },
    { key: 'email', width: 32 },
    { key: 'activation', width: 18 },
    { key: 'workplace', width: 46 },
    { key: 'count', width: 12 },
  ];

  const header = sheet.addRow(['ПІБ', 'Email', 'Активація', 'Кафедра / Відділ', 'Кількість']);
  header.font = { bold: true };
  header.alignment = { vertical: 'middle', horizontal: 'center' };
  header.height = 22;
  for (const cell of ['A1', 'B1', 'C1', 'D1', 'E1']) {
    sheet.getCell(cell).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFEFEFEF' },
    };
    sheet.getCell(cell).border = THIN;
  }

  for (const row of rows) {
    const added = sheet.addRow([
      row.fullName,
      row.email ?? EMPTY,
      activationText(row.isActivated),
      workplaceText(row),
    ]);
    for (let col = 1; col <= 4; col++) added.getCell(col).border = THIN;
    added.getCell(3).alignment = { horizontal: 'center' };
  }

  // The total sits in the first row under its heading. A number, not a string,
  // so the reader can go on calculating with it.
  const total = sheet.getCell('E2');
  total.value = rows.length;
  total.alignment = { vertical: 'middle', horizontal: 'center' };
  total.font = { bold: true };
  total.border = THIN;

  // An empty result still gets its headings and a nought — a blank sheet reads
  // as a broken export, «0» reads as an answer.
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: 'A1', to: 'D1' };

  return wb;
}
