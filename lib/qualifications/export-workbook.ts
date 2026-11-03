import ExcelJS from 'exceljs';
import {
  creditsLabel,
  documentNumber,
  formatIssuedOn,
  hoursFromCredits,
  hoursLabel,
} from '@/lib/qualifications/format';
import {
  DOCUMENT_TYPE_LABELS,
  QUALIFICATION_KIND_LABELS,
  type DocumentTypeKey,
  type QualificationKindKey,
} from '@/lib/qualifications/options';

/**
 * «Підвищення кваліфікації / Стажування» as a spreadsheet (owner, 2026-10-13;
 * reshaped 2026-11-03): **one row per person, at most four columns.**
 *
 * Every record of the person is written, as a block of lines, into the last
 * column, newest first — the HR reader scans a person at a glance instead of
 * hunting across fourteen columns. The columns before it say as much of the
 * person's place as the list was not already narrowed to:
 *
 * - `all`        — no filter:       ПІБ | Факультет | Кафедра | the records
 * - `faculty`    — one факультет:   ПІБ | Кафедра | the records
 * - `department` — one кафедра:     ПІБ | the records
 *
 * The trade-off, accepted by the owner: a record is no longer a row, so the
 * sheet cannot be sorted or summed by credits or date. The file is for reading.
 *
 * No file contents and no links to scans: the scan is read in the app, behind a
 * login. A `url` the person typed is printed — it is theirs and public.
 */
export interface QualificationExportRecord {
  kind: QualificationKindKey;
  institution: string;
  documentType: DocumentTypeKey;
  series: string | null;
  number: string | null;
  url: string | null;
  topic: string;
  /** `YYYY-MM-DD` */
  issuedOn: string;
  creditsHundredths: number;
}

export interface QualificationExportPerson {
  fullName: string;
  /** The person's факультети, primary first, no repeats. */
  faculties: string[];
  /** The person's кафедри, primary first. */
  departments: string[];
  /** Newest first — the order they are written in. */
  records: QualificationExportRecord[];
}

export type QualificationExportScope = 'all' | 'faculty' | 'department';

export const QUALIFICATIONS_SHEET = 'Підвищення кваліфікації';

/** One empty line between two records of one person. */
const RECORD_SEPARATOR = '\n\n';

/**
 * One record as the owner laid it out (2026-11-03) — four lines grouped
 * together, a fifth only when the person gave a link:
 *
 *   Підвищення кваліфікації 11.02.2025
 *   Результати досліджень у професійній освіті педагогів
 *   Міжнародна школа педагогічної майстерності
 *   Сертифікат № 2026/02/092 3 кредити (90 годин)
 *   https://…
 *
 * Hours are credits × 30, the same `hoursFromCredits` the screen uses.
 */
export function qualificationText(r: QualificationExportRecord): string {
  const number = documentNumber(r.series, r.number);
  const document = number
    ? `${DOCUMENT_TYPE_LABELS[r.documentType]} ${number}`
    : DOCUMENT_TYPE_LABELS[r.documentType];
  const facts = `${document} ${creditsLabel(r.creditsHundredths)} (${hoursLabel(
    hoursFromCredits(r.creditsHundredths)
  )})`;
  return [
    `${QUALIFICATION_KIND_LABELS[r.kind]} ${formatIssuedOn(r.issuedOn)}`,
    r.topic,
    r.institution,
    facts,
    r.url,
  ]
    .filter((line) => line)
    .join('\n');
}

const THIN = {
  top: { style: 'thin' as const },
  left: { style: 'thin' as const },
  bottom: { style: 'thin' as const },
  right: { style: 'thin' as const },
};

interface Column {
  header: string;
  width: number;
  value: (p: QualificationExportPerson) => string;
}

const NAME: Column = { header: 'ПІБ', width: 36, value: (p) => p.fullName };
const FACULTY: Column = {
  header: 'Факультет',
  width: 30,
  value: (p) => p.faculties.join('\n'),
};
const DEPARTMENT: Column = {
  header: 'Кафедра',
  width: 34,
  value: (p) => p.departments.join('\n'),
};
const RECORDS: Column = {
  header: 'Підвищення кваліфікації / Стажування',
  width: 90,
  value: (p) => p.records.map(qualificationText).join(RECORD_SEPARATOR),
};

const COLUMNS: Record<QualificationExportScope, Column[]> = {
  all: [NAME, FACULTY, DEPARTMENT, RECORDS],
  faculty: [NAME, DEPARTMENT, RECORDS],
  department: [NAME, RECORDS],
};

export function buildQualificationsWorkbook(
  people: readonly QualificationExportPerson[],
  scope: QualificationExportScope = 'all'
): ExcelJS.Workbook {
  const columns = COLUMNS[scope];
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();
  const sheet = wb.addWorksheet(QUALIFICATIONS_SHEET);

  sheet.columns = columns.map((c, i) => ({ key: `c${i}`, width: c.width }));

  const header = sheet.addRow(columns.map((c) => c.header));
  header.font = { bold: true };
  header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  header.height = 24;
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
    cell.border = THIN;
  });

  for (const person of people) {
    const added = sheet.addRow(columns.map((c) => c.value(person)));
    added.eachCell((cell) => {
      cell.border = THIN;
      cell.alignment = { vertical: 'top', wrapText: true };
    });
  }

  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  return wb;
}
