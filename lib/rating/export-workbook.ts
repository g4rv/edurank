import ExcelJS from 'exceljs';
import type { EvidenceField } from '@/lib/rating/evidence-fields';
import {
  RATING_DIVISION_SHORT as DIVISION_SHORT,
  SECTION_TITLES,
  type RatingDivisionKey,
} from '@/lib/rating/activity-types';
import { personFileNames } from '@/lib/export/file-names';

// Replicates the official per-teacher rating workbook
// (edu-reference/Фінансів/Таблиці_Викладачів/*.xlsx): columns
// A № п/п | B Зміст показників | C бали | D Критерії | E Отриманий рейтинг | F Дані внесені
// Layout follows the paper form: centered text, item number merged
// vertically across its option rows, gray section bands.

// Short division names as they appear in the sheet's «Дані внесені» column
export interface ExportActivityType {
  code: string;
  label: string;
  itemNumber: string;
  coefficient: number;
  coefficientNote: string | null;
  sectionNumber: number;
  /** The year's own heading for that розділ (RatingSection.title) */
  sectionTitle: string;
  /** Parsed off the row's evidenceFields JSON by the caller */
  fields: readonly EvidenceField[];
  /** Registry short key resolved by the caller from verifyingDivisionId */
  divisionKey: RatingDivisionKey | null;
  /** 5.1 — scores nothing: one row reading «Виконано» / «Не заповнено» (2026-10-16) */
  gatesRating?: boolean;
}

export interface ExportActivity {
  code: string;
  score: number;
  /** evidence.option / evidence.mode — matches the earned row in grouped items */
  option: string | null;
}

export interface ExportStaffData {
  fullName: string;
  department: string;
  year: number;
  activities: ExportActivity[];
  /**
   * 5.1 has no entry (owner, 2026-10-19) — or, for a person with disciplines
   * assigned, not one for each of them (2026-11-19). `pending` — an open year:
   * the total adds up and the form warns; `zeroed` — the year closed without
   * it: 0. While it is set the 5.1 lines read «Не заповнено», whatever entries
   * exist, so a line and the warning under it never disagree.
   */
  gate?: 'pending' | 'zeroed';
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * What `SUM(E{from}:E{to})` comes to — numbers only, as Excel's SUM.
 *
 * Stored as the formula's cached `result` (owner, 2026-11-17: «no section
 * totals in the export»). A formula alone has no value until something
 * calculates it, and a downloaded file opens in Excel's Protected View, an
 * iPhone or a messenger preview — none of which calculate — so every total
 * read empty. The formula stays, so an edited cell still recalculates.
 */
function columnSum(ws: ExcelJS.Worksheet, from: number, to: number): number {
  let sum = 0;
  for (let r = from; r <= to; r++) {
    const v = ws.getRow(r).getCell(5).value;
    if (typeof v === 'number') sum += v;
  }
  return round2(sum);
}

const DONE = 'Виконано';
const NOT_DONE = 'Не заповнено';

/**
 * One .xlsx filename per staff member, in the same order as the input.
 * Thin wrapper over the shared helper, which the Характеристика export uses too.
 */
export function ratingFileNames(fullNames: string[]): string[] {
  return personFileNames(fullNames);
}

/** The select whose options become sub-rows (role `option` or moodle `mode`) */
function optionField(fields: readonly EvidenceField[]) {
  return (
    fields.find(
      (f): f is Extract<EvidenceField, { kind: 'select' }> =>
        f.kind === 'select' && (f.name === 'option' || f.name === 'mode')
    ) ?? null
  );
}

const THIN = { style: 'thin' as const };
const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };
const CENTER: Partial<ExcelJS.Alignment> = {
  horizontal: 'center',
  vertical: 'middle',
  wrapText: true,
};
const GRAY_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFD9D9D9' },
};
const LIGHT_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFF2F2F2' },
};
const SCORE_FORMAT = '0.0';

/** Border + centering for the six table columns of a row */
function styleTableRow(row: ExcelJS.Row) {
  for (let col = 1; col <= 6; col++) {
    const cell = row.getCell(col);
    cell.border = BORDER;
    cell.alignment = CENTER;
  }
  row.getCell(5).numFmt = SCORE_FORMAT;
}

export function buildRatingWorkbook(
  staff: ExportStaffData,
  types: ExportActivityType[]
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Рейтинг');

  ws.columns = [
    { width: 8 },
    { width: 55 },
    { width: 12 },
    { width: 18 },
    { width: 14 },
    { width: 14 },
  ];

  // Earned scores: grouped types match by option, plain types sum everything
  const scoreByCodeOption = new Map<string, number>();
  const scoreByCode = new Map<string, number>();
  for (const a of staff.activities) {
    scoreByCode.set(a.code, (scoreByCode.get(a.code) ?? 0) + a.score);
    if (a.option) {
      const key = `${a.code}:${a.option}`;
      scoreByCodeOption.set(key, (scoreByCodeOption.get(key) ?? 0) + a.score);
    }
  }

  // ── Header block ──
  ws.addRow([]);
  const title = ws.addRow(['ТАБЛИЦЯ РЕЙТИНГОВОГО ОЦІНЮВАННЯ']);
  ws.mergeCells(`A${title.number}:F${title.number}`);
  title.getCell(1).font = { bold: true, size: 12 };
  title.getCell(1).alignment = { horizontal: 'center' };

  const subtitle = ws.addRow([
    'ПРОФЕСІЙНОЇ ДІЯЛЬНОСТІ НАУКОВО-ПЕДАГОГІЧНИХ ПРАЦІВНИКІВ УНІВЕРСИТЕТУ ЗА',
    '',
    '',
    '',
    staff.year,
  ]);
  ws.mergeCells(`A${subtitle.number}:D${subtitle.number}`);
  subtitle.getCell(1).font = { bold: true, size: 12 };
  subtitle.getCell(1).alignment = { horizontal: 'center' };
  subtitle.getCell(5).font = { bold: true, size: 12 };
  subtitle.getCell(5).alignment = { horizontal: 'center' };
  subtitle.getCell(5).fill = LIGHT_FILL;

  ws.addRow([]);
  const dept = ws.addRow(['', 'Кафедра', '', staff.department]);
  ws.mergeCells(`D${dept.number}:F${dept.number}`);
  dept.getCell(2).font = { bold: true };
  dept.getCell(2).alignment = { horizontal: 'center' };
  dept.getCell(4).font = { bold: true };
  dept.getCell(4).alignment = { horizontal: 'center' };
  ws.addRow([]);

  const person = ws.addRow(['', 'Науково-педагогічний працівник', '', staff.fullName]);
  ws.mergeCells(`D${person.number}:F${person.number}`);
  person.getCell(2).font = { bold: true };
  person.getCell(2).alignment = { horizontal: 'center' };
  person.getCell(4).font = { bold: true };
  person.getCell(4).alignment = { horizontal: 'center' };
  person.getCell(4).fill = LIGHT_FILL;
  person.getCell(4).border = { bottom: THIN };

  const hint = ws.addRow(['', '', '', '( Прізвище, ім’я, по батькові )']);
  ws.mergeCells(`D${hint.number}:F${hint.number}`);
  hint.getCell(4).font = { size: 9, bold: true };
  hint.getCell(4).alignment = { horizontal: 'center' };
  ws.addRow([]);

  // ── Table header ──
  const header = ws.addRow([
    '№\nп/п',
    'Зміст показників',
    '',
    'Критерії\n(балів)',
    'Отриманий\nрейтинг',
    'Дані внесені',
  ]);
  ws.mergeCells(`B${header.number}:C${header.number}`);
  header.eachCell({ includeEmpty: true }, (cell, col) => {
    if (col > 6) return;
    cell.font = { bold: true };
    cell.alignment = CENTER;
    cell.border = BORDER;
  });
  header.height = 30;

  const sectionTotalRows: number[] = [];
  /** Each розділ's sum, stored beside its formula (see `columnSum`) */
  const sectionResults: number[] = [];

  for (const sectionNumber of [1, 2, 3, 4, 5]) {
    const sectionTypes = types.filter((t) => t.sectionNumber === sectionNumber);
    if (sectionTypes.length === 0) continue;

    // The year's own heading, not the code catalogue's: the sheet is the
    // official form for THAT year and must read the way that year is defined.
    const sectionTitle = sectionTypes[0]?.sectionTitle || SECTION_TITLES[sectionNumber] || '';
    const sectionRow = ws.addRow([`${sectionNumber}.`, sectionTitle]);
    ws.mergeCells(`B${sectionRow.number}:F${sectionRow.number}`);
    styleTableRow(sectionRow);
    sectionRow.getCell(1).font = { bold: true };
    sectionRow.getCell(2).font = { bold: true };
    sectionRow.getCell(2).fill = GRAY_FILL;

    const firstItemRow = ws.rowCount + 1;

    for (const type of sectionTypes) {
      const itemNumber = type.itemNumber ? `${type.itemNumber}.` : '';
      const division = type.divisionKey ? DIVISION_SHORT[type.divisionKey] : '';
      const opt = optionField(type.fields);

      if (type.gatesRating) {
        // 5.1 scores nothing for anybody: a status in the score column, and no
        // per-option rows of points that do not exist (owner, 2026-10-16)
        const row = ws.addRow([
          itemNumber,
          type.label,
          '',
          type.coefficientNote ?? '',
          scoreByCode.has(type.code) && !staff.gate ? DONE : NOT_DONE,
          division,
        ]);
        styleTableRow(row);
        row.getCell(1).font = { bold: true };
        row.getCell(5).font = { bold: true };
      } else if (opt) {
        // Group: label row, then one row per option; № merged across the group.
        // Критерії stays empty — the per-option points live in column C.
        const head = ws.addRow(['', `${type.label}:`]);
        styleTableRow(head);
        head.getCell(2).font = { bold: true };

        for (const option of opt.options) {
          const earned = scoreByCodeOption.get(`${type.code}:${option.value}`);
          const row = ws.addRow([
            '',
            option.label,
            option.points ?? '',
            '',
            earned ?? '',
            division,
          ]);
          styleTableRow(row);
          if (earned !== undefined) row.getCell(5).font = { bold: true };
        }

        ws.mergeCells(`A${head.number}:A${ws.rowCount}`);
        const numberCell = ws.getCell(`A${head.number}`);
        numberCell.value = itemNumber;
        numberCell.font = { bold: true };
        numberCell.alignment = CENTER;
      } else {
        // Plain indicator; Критерії holds only the short unit note
        const earned = scoreByCode.get(type.code);
        const row = ws.addRow([
          itemNumber,
          type.label,
          type.coefficient,
          type.coefficientNote ?? '',
          earned ?? '',
          division,
        ]);
        styleTableRow(row);
        row.getCell(1).font = { bold: true };
        if (earned !== undefined) row.getCell(5).font = { bold: true };
      }
    }

    const lastItemRow = ws.rowCount;
    const totalRow = ws.addRow([`Всього балів по розділу ${sectionNumber}`]);
    ws.mergeCells(`A${totalRow.number}:D${totalRow.number}`);
    styleTableRow(totalRow);
    totalRow.getCell(1).font = { bold: true };
    // A розділ of 5.1 alone has nothing to add up — it repeats the status
    if (sectionTypes.every((t) => t.gatesRating)) {
      totalRow.getCell(5).value =
        !staff.gate && sectionTypes.every((t) => scoreByCode.has(t.code)) ? DONE : NOT_DONE;
    } else {
      const result = columnSum(ws, firstItemRow, lastItemRow);
      sectionResults.push(result);
      totalRow.getCell(5).value = {
        formula: `SUM(E${firstItemRow}:E${lastItemRow})`,
        result,
      } as ExcelJS.CellFormulaValue;
    }
    totalRow.getCell(5).font = { bold: true };
    sectionTotalRows.push(totalRow.number);
  }

  const grand = ws.addRow(['Загальна сума балів']);
  ws.mergeCells(`A${grand.number}:D${grand.number}`);
  styleTableRow(grand);
  grand.getCell(1).font = { bold: true, size: 12 };
  // 5.1 has no entry → an open year warns, a closed one counted 0, as the app
  // says (owner, 2026-10-19)
  grand.getCell(5).value =
    staff.gate === 'zeroed'
      ? 0
      : ({
          formula: `SUM(${sectionTotalRows.map((r) => `E${r}`).join(',')})`,
          result: round2(sectionResults.reduce((a, b) => a + b, 0)),
        } as ExcelJS.CellFormulaValue);
  grand.getCell(5).font = { bold: true, size: 12 };
  if (staff.gate) {
    grand.getCell(6).value =
      staff.gate === 'zeroed'
        ? 'п. 5.1 не заповнено — рік не зараховано'
        : 'п. 5.1 не заповнено — без нього рік не буде зараховано';
  }

  return wb;
}
