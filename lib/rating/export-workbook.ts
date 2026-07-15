import ExcelJS from 'exceljs';
import { EVIDENCE_FIELDS, type EvidenceField } from '@/lib/rating/evidence-fields';
import { SECTION_TITLES, type RatingDivisionKey } from '@/lib/rating/activity-types';
import { MOODLE_MODE_POINTS, SELECT_OPTION_POINTS } from '@/lib/rating/scoring';
import { activityTypeMeta } from '@/lib/rating/registry';

// Replicates the official per-teacher rating workbook
// (edu-reference/Фінансів/Таблиці_Викладачів/*.xlsx): columns
// A № п/п | B Зміст показників | C бали | D Критерії | E Отриманий рейтинг | F Дані внесені

// Short division names as they appear in the sheet's «Дані внесені» column
const DIVISION_SHORT: Record<RatingDivisionKey, string> = {
  KADRY: 'Відділ кадрів',
  NAVCH: 'Навч. відділ',
  NNV: 'ННВ',
  NNCZYAO: 'ННЦЗЯО',
  VMZ: 'ВМЗ',
  VA: 'ВА',
};

export interface ExportActivityType {
  code: string;
  label: string;
  coefficient: number;
  coefficientNote: string | null;
  sectionNumber: number;
  /** Registry short key resolved by the caller from verifyingDivisionId */
  divisionKey: RatingDivisionKey | null;
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
}

function itemNumberFor(code: string): string {
  try {
    return `${activityTypeMeta(code).def.itemNumber}.`;
  } catch {
    return '';
  }
}

/** The select whose options become sub-rows (role `option` or moodle `mode`) */
function optionField(code: string) {
  const fields = EVIDENCE_FIELDS[code] ?? [];
  return (
    fields.find(
      (f): f is Extract<EvidenceField, { kind: 'select' }> =>
        f.kind === 'select' && (f.name === 'option' || f.name === 'mode')
    ) ?? null
  );
}

function optionPoints(code: string, value: string): number | null {
  const bySelect = (SELECT_OPTION_POINTS as Record<string, Record<string, number>>)[code];
  if (bySelect?.[value] !== undefined) return bySelect[value];
  const byMode = (MOODLE_MODE_POINTS as Record<string, number>)[value];
  return byMode ?? null;
}

const THIN = { style: 'thin' as const };
const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };

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
    { width: 22 },
    { width: 14 },
    { width: 15 },
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
    `ПРОФЕСІЙНОЇ ДІЯЛЬНОСТІ НАУКОВО-ПЕДАГОГІЧНИХ ПРАЦІВНИКІВ УНІВЕРСИТЕТУ ЗА ${staff.year} РІК`,
  ]);
  ws.mergeCells(`A${subtitle.number}:F${subtitle.number}`);
  subtitle.getCell(1).font = { bold: true, size: 12 };
  subtitle.getCell(1).alignment = { horizontal: 'center' };

  ws.addRow([]);
  const dept = ws.addRow(['', 'Кафедра', staff.department]);
  dept.getCell(2).font = { bold: true };
  dept.getCell(3).font = { bold: true, underline: true };
  ws.mergeCells(`C${dept.number}:F${dept.number}`);

  const person = ws.addRow(['', 'Науково-педагогічний працівник', staff.fullName]);
  person.getCell(2).font = { bold: true };
  person.getCell(3).font = { bold: true, underline: true };
  ws.mergeCells(`C${person.number}:F${person.number}`);

  const hint = ws.addRow(['', '', '( Прізвище, ім’я, по батькові )']);
  hint.getCell(3).font = { size: 8 };
  ws.mergeCells(`C${hint.number}:F${hint.number}`);
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
  header.eachCell((cell) => {
    cell.font = { bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = BORDER;
  });
  header.height = 30;

  const sectionTotalRows: number[] = [];

  for (const sectionNumber of [1, 2, 3, 4, 5]) {
    const sectionTypes = types.filter((t) => t.sectionNumber === sectionNumber);
    if (sectionTypes.length === 0) continue;

    const sectionRow = ws.addRow([`${sectionNumber}.`, SECTION_TITLES[sectionNumber] ?? '']);
    ws.mergeCells(`B${sectionRow.number}:F${sectionRow.number}`);
    sectionRow.eachCell({ includeEmpty: true }, (cell, col) => {
      if (col <= 6) {
        cell.font = { bold: true };
        cell.border = BORDER;
      }
    });

    const firstItemRow = ws.rowCount + 1;

    for (const type of sectionTypes) {
      const itemNumber = itemNumberFor(type.code);
      const division = type.divisionKey ? DIVISION_SHORT[type.divisionKey] : '';
      const opt = optionField(type.code);

      if (opt) {
        // Group header, then one row per option with its points
        const head = ws.addRow([itemNumber, `${type.label}:`, '', type.coefficientNote ?? '']);
        head.getCell(1).font = { bold: true };
        head.getCell(2).font = { bold: true };
        head.eachCell({ includeEmpty: true }, (cell, col) => {
          if (col <= 6) cell.border = BORDER;
        });
        head.getCell(2).alignment = { wrapText: true };

        for (const option of opt.options) {
          const earned = scoreByCodeOption.get(`${type.code}:${option.value}`);
          const row = ws.addRow([
            '',
            option.label,
            optionPoints(type.code, option.value) ?? '',
            '',
            earned ?? '',
            division,
          ]);
          row.getCell(2).alignment = { wrapText: true };
          if (earned !== undefined) row.getCell(5).font = { bold: true };
          row.eachCell({ includeEmpty: true }, (cell, col) => {
            if (col <= 6) cell.border = BORDER;
          });
        }
      } else {
        const earned = scoreByCode.get(type.code);
        const row = ws.addRow([
          itemNumber,
          type.label,
          type.coefficient,
          type.coefficientNote ?? '',
          earned ?? '',
          division,
        ]);
        row.getCell(1).font = { bold: true };
        row.getCell(2).alignment = { wrapText: true };
        row.getCell(4).alignment = { wrapText: true };
        if (earned !== undefined) row.getCell(5).font = { bold: true };
        row.eachCell({ includeEmpty: true }, (cell, col) => {
          if (col <= 6) cell.border = BORDER;
        });
      }
    }

    const lastItemRow = ws.rowCount;
    const totalRow = ws.addRow([`Всього балів по розділу ${sectionNumber}`]);
    ws.mergeCells(`A${totalRow.number}:D${totalRow.number}`);
    totalRow.getCell(1).font = { bold: true };
    totalRow.getCell(5).value = {
      formula: `SUM(E${firstItemRow}:E${lastItemRow})`,
    } as ExcelJS.CellFormulaValue;
    totalRow.getCell(5).font = { bold: true };
    totalRow.eachCell({ includeEmpty: true }, (cell, col) => {
      if (col <= 6) cell.border = BORDER;
    });
    sectionTotalRows.push(totalRow.number);
  }

  const grand = ws.addRow(['Загальна сума балів']);
  ws.mergeCells(`A${grand.number}:D${grand.number}`);
  grand.getCell(1).font = { bold: true, size: 12 };
  grand.getCell(5).value = {
    formula: `SUM(${sectionTotalRows.map((r) => `E${r}`).join(',')})`,
  } as ExcelJS.CellFormulaValue;
  grand.getCell(5).font = { bold: true, size: 12 };
  grand.eachCell({ includeEmpty: true }, (cell, col) => {
    if (col <= 6) cell.border = BORDER;
  });

  return wb;
}
