import ExcelJS from 'exceljs';

/**
 * A кафедра's (or a факультет's) НПП with their rating, as a spreadsheet — the
 * list a завідувач or декан takes to a meeting (owner, 2026-09-24).
 *
 * Grouped by кафедра (owner, 2026-09-24): a yellow row naming the кафедра,
 * then its people. The кафедра used to be a column repeated on every row.
 *
 * Deliberately small: ПІБ and rating. The official per-person forms are
 * `/api/export/ratings` and `/api/export/kharakterystyka`; this is the roll
 * call, not the document.
 */
export interface RatingListGroup {
  department: string;
  staff: {
    fullName: string;
    /** The rating total for the year — stored to 2 decimals */
    total: number;
    /** Listed under a кафедра that is their ADDITIONAL one */
    isPartTime: boolean;
  }[];
}

const THIN = {
  top: { style: 'thin' as const },
  left: { style: 'thin' as const },
  bottom: { style: 'thin' as const },
  right: { style: 'thin' as const },
};

const YELLOW = {
  type: 'pattern' as const,
  pattern: 'solid' as const,
  fgColor: { argb: 'FFFFFF00' },
};

export function buildRatingListWorkbook(
  groups: readonly RatingListGroup[],
  year: number
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();
  const sheet = wb.addWorksheet('Рейтинг');

  sheet.columns = [
    { key: 'n', width: 6 },
    { key: 'name', width: 44 },
    { key: 'total', width: 16 },
  ];

  const header = sheet.addRow(['№', 'ПІБ', `Рейтинг ${year}`]);
  header.font = { bold: true };
  header.alignment = { vertical: 'middle', horizontal: 'center' };
  header.height = 22;
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
    cell.border = THIN;
  });

  for (const group of groups) {
    // The кафедра's own row: yellow, black bold, its name across ПІБ and
    // Рейтинг. The № cell is painted too, so the band runs the full width.
    const title = sheet.addRow([null, group.department]);
    sheet.mergeCells(title.number, 2, title.number, 3);
    for (const col of [1, 2]) {
      const cell = title.getCell(col);
      cell.fill = YELLOW;
      cell.font = { bold: true, color: { argb: 'FF000000' } };
      cell.border = THIN;
    }
    title.getCell(2).alignment = { vertical: 'middle', wrapText: true };

    group.staff.forEach((person, i) => {
      const added = sheet.addRow([
        i + 1,
        // A сумісник is paid by two кафедри and counts toward only one Кнпп —
        // said in the cell, because a spreadsheet has no badge.
        person.isPartTime ? `${person.fullName} (сумісник)` : person.fullName,
        // A number, not text: whoever opens this will sort and sum it. No
        // `numFmt`: `0.##` printed a whole number as «2797,» (owner,
        // 2026-09-24), and General shows 2797 and 2411,5.
        person.total,
      ]);
      added.eachCell((cell) => (cell.border = THIN));
      added.getCell(1).alignment = { horizontal: 'center' };
      added.getCell(3).alignment = { horizontal: 'center' };
    });
  }

  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  return wb;
}
