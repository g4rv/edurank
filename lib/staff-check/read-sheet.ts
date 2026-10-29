import ExcelJS from 'exceljs';
import { parseStaffSheet, type SheetPlacement } from '@/lib/staff-check/parse';

/** HR's staff.xlsx, first sheet, as placements — shared by the two staff-list scripts */
export async function readStaffSheet(file: string): Promise<SheetPlacement[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.worksheets[0];
  const text = (v: ExcelJS.CellValue): string | null => {
    if (v == null) return null;
    if (typeof v === 'object') {
      if ('richText' in v) return v.richText.map((t) => t.text).join('');
      if ('text' in v) return String(v.text);
      if ('result' in v) return v.result == null ? null : String(v.result);
      return null;
    }
    return String(v);
  };
  const rows: { row: number; cells: (string | null)[] }[] = [];
  ws.eachRow({ includeEmpty: true }, (row, n) => {
    if (n > 1)
      rows.push({ row: n, cells: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => text(row.getCell(i).value)) });
  });
  return parseStaffSheet(rows);
}
