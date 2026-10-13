import ExcelJS from 'exceljs';
import { hoursFromCredits } from '@/lib/qualifications/format';
import {
  DOCUMENT_TYPE_LABELS,
  QUALIFICATION_KIND_LABELS,
  type DocumentTypeKey,
  type QualificationKindKey,
} from '@/lib/qualifications/options';

/**
 * «Підвищення кваліфікації / Стажування» as a spreadsheet (owner, 2026-10-13):
 * one row per record, for one НПП or for everybody on the staff list.
 *
 * **Flat, with the person on every row**, not grouped under a heading: whoever
 * opens it filters and sorts it — by кафедра, by вид, by date — and a grouped
 * sheet cannot be filtered. The sheet carries an autofilter for that reason.
 *
 * Credits, hours and the date are real numbers and a real date, so Excel sorts
 * and sums them. Hours are credits × 30, the same `hoursFromCredits` the screen
 * uses — there is no stored hours to disagree with.
 *
 * No file contents and no links to them: the scan is read in the app, behind a
 * login. The column only says whether one is attached.
 */
export interface QualificationExportRow {
  fullName: string;
  /** «Кафедра ботаніки + Кафедра екології» — see `workplaceText` */
  workplace: string;
  kind: QualificationKindKey;
  institution: string;
  documentType: DocumentTypeKey;
  series: string | null;
  number: string;
  topic: string;
  /** `YYYY-MM-DD` */
  issuedOn: string;
  creditsHundredths: number;
  hasFile: boolean;
}

export const QUALIFICATIONS_SHEET = 'Підвищення кваліфікації';

const THIN = {
  top: { style: 'thin' as const },
  left: { style: 'thin' as const },
  bottom: { style: 'thin' as const },
  right: { style: 'thin' as const },
};

const HEADERS = [
  '№',
  'ПІБ',
  'Кафедра / Відділ',
  'Вид',
  'Найменування закладу',
  'Вид документа',
  'Серія',
  'Номер',
  'Тема / спеціальність',
  'Дата видачі',
  'Кредити',
  'Години',
  'Файл',
] as const;

export function buildQualificationsWorkbook(
  rows: readonly QualificationExportRow[]
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();
  const sheet = wb.addWorksheet(QUALIFICATIONS_SHEET);

  sheet.columns = [
    { key: 'n', width: 6 },
    { key: 'name', width: 38 },
    { key: 'workplace', width: 36 },
    { key: 'kind', width: 24 },
    { key: 'institution', width: 40 },
    { key: 'documentType', width: 16 },
    { key: 'series', width: 12 },
    { key: 'number', width: 16 },
    { key: 'topic', width: 44 },
    { key: 'issuedOn', width: 14 },
    { key: 'credits', width: 10 },
    { key: 'hours', width: 10 },
    { key: 'file', width: 8 },
  ];

  const header = sheet.addRow([...HEADERS]);
  header.font = { bold: true };
  header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  header.height = 24;
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
    cell.border = THIN;
  });

  rows.forEach((row, i) => {
    const added = sheet.addRow([
      i + 1,
      row.fullName,
      row.workplace,
      QUALIFICATION_KIND_LABELS[row.kind],
      row.institution,
      DOCUMENT_TYPE_LABELS[row.documentType],
      row.series ?? '',
      row.number,
      row.topic,
      // A date, read as UTC midnight like every stored calendar date — a local
      // parse would move it a day for anyone east of UTC.
      new Date(`${row.issuedOn}T00:00:00.000Z`),
      row.creditsHundredths / 100,
      hoursFromCredits(row.creditsHundredths),
      row.hasFile ? 'є' : '—',
    ]);
    added.eachCell((cell) => {
      cell.border = THIN;
      cell.alignment = { vertical: 'top', wrapText: true };
    });
    added.getCell(1).alignment = { vertical: 'top', horizontal: 'center' };
    const date = added.getCell(10);
    date.numFmt = 'dd.mm.yyyy';
    date.alignment = { vertical: 'top', horizontal: 'center' };
    for (const col of [11, 12, 13]) {
      added.getCell(col).alignment = { vertical: 'top', horizontal: 'center' };
    }
  });

  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: HEADERS.length } };
  return wb;
}
