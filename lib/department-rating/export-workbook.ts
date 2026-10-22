import ExcelJS from 'exceljs';
import type { DepartmentNarrative } from '@/validations/department-report';
import {
  DEVELOPMENT_BOXES,
  IMPACT_BOXES,
  IMPACT_KIND_LABEL,
  INITIATIVE_BOXES,
  NARRATIVE_TITLES,
  STUDY_BOXES,
} from './narrative-labels';
import { boxText } from './narrative-summary';
import { indicatorScore, type IndicatorRow, type ReportValues } from './score';

export interface DepartmentReportExport {
  departmentName: string;
  year: number;
  indicators: IndicatorRow[];
  values: ReportValues;
  narrative: DepartmentNarrative;
  total: number;
}

// The look of `edu-reference/department_raiting_template.xlsx`: Montserrat 12,
// a medium black frame on every cell, green where somebody types, grey item
// numbers, a peach «Всього».
const FONT = { name: 'Montserrat', size: 12 } as const;
const MEDIUM = { style: 'medium', color: { argb: 'FF000000' } } as const;
const FRAME = { top: MEDIUM, left: MEDIUM, bottom: MEDIUM, right: MEDIUM };
const solid = (argb: string): ExcelJS.Fill => ({
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb },
  bgColor: { argb },
});
const GREEN = solid('FF00FF00');
const GREY = solid('FFEFEFEF');
const PEACH = solid('FFFCE5CD');
const WHITE = solid('FFFFFFFF');
const RED = solid('FFFF0000');

// Column letters A–F and their widths, as the template sets them
const WIDTHS = [6.75, 70, 16.63, 15.63, 15.25, 22, 36];
const A = 1;
const B = 2;
const C = 3;
const D = 4;
const E = 5;
const F = 6;
const G = 7;

const NOTE =
  '1. Всі дані вносяться ВИКЛЮЧНО в зелені ячейки. \n2. У показники кафедри вносяться дані ЛИШЕ по ШТАТНИМ працівникам';

/** Excel does not fit a merged cell to its text, so the row is sized by hand */
function heightFor(texts: [string, number][], min = 0): number {
  let lines = 1;
  for (const [text, width] of texts) {
    const perLine = Math.max(8, Math.floor(width * 0.6));
    const n = text
      .split('\n')
      .reduce((sum, part) => sum + Math.max(1, Math.ceil(part.length / perLine)), 0);
    lines = Math.max(lines, n);
  }
  const h = lines * 20 + 6;
  return Math.max(h, min);
}

const spanWidth = (c1: number, c2: number) => WIDTHS.slice(c1 - 1, c2).reduce((s, w) => s + w, 0);

/** The label with its hint, as the template prints it: «Очікувані результати в 2026 році (до 10 речень)» */
const labelOf = (b: { label: string; hint?: string }) =>
  b.hint ? `${b.label} (${b.hint[0].toLowerCase()}${b.hint.slice(1)})` : b.label;

type Style = {
  value?: ExcelJS.CellValue;
  bold?: boolean;
  italic?: boolean;
  fill?: ExcelJS.Fill;
  frame?: boolean;
  align?: Partial<ExcelJS.Alignment>;
  numFmt?: string;
};

/** One cell or a merged block, every cell of it styled — a merge keeps no style of its own at the edges */
function put(ws: ExcelJS.Worksheet, r1: number, c1: number, r2: number, c2: number, s: Style) {
  if (r1 !== r2 || c1 !== c2) ws.mergeCells(r1, c1, r2, c2);
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      const cell = ws.getCell(r, c);
      cell.font = { ...FONT, bold: s.bold, italic: s.italic };
      if (s.frame) cell.border = FRAME;
      if (s.fill) cell.fill = s.fill;
      if (s.align) cell.alignment = s.align;
      if (s.numFmt) cell.numFmt = s.numFmt;
    }
  }
  const master = ws.getCell(r1, c1);
  master.value = s.value === '' ? null : (s.value ?? null);
}

const LEFT = { horizontal: 'left', vertical: 'bottom', wrapText: true } as const;
const CENTER = { horizontal: 'center', wrapText: true } as const;

/**
 * One кафедра's Рейтинг кафедри laid out as the template's sheet: the title in
 * A2, the кафедра in C4, «Всього» in row 6, the scored lines from row 9, then
 * items 14–17 in the same frames. Бал and «Всього» are the template's own
 * formulas (with the saved result stored beside them), so a person who edits a
 * count in Excel sees the score move.
 *
 * Item numbers are TEXT. The template stored them as numbers in a sheet that
 * read «1.1» as the first of January, which is how its column A came to hold
 * dates.
 */
export function buildDepartmentReportWorkbook(input: DepartmentReportExport): ExcelJS.Workbook {
  const { departmentName, year, indicators, values, narrative, total } = input;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Рейтинг кафедри');

  ws.columns = WIDTHS.map((width) => ({ width }));
  ws.getColumn(A).numFmt = '@';
  ws.pageSetup = {
    paperSize: 9,
    orientation: 'portrait',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
  };

  put(ws, 2, A, 2, E, {
    value: `Звіт за ${year} календарний рік`,
    bold: true,
    align: CENTER,
  });
  put(ws, 4, B, 4, B, { value: 'Назва кафедри', bold: true, align: CENTER });
  put(ws, 4, C, 4, E, { value: departmentName, fill: GREEN, align: CENTER });
  ws.getRow(4).height = heightFor([[departmentName, spanWidth(C, E)]]);

  // The note that sits beside the form in the template
  put(ws, 5, G, 5, G, { value: 'ВАЖЛИВО:', fill: RED });
  put(ws, 6, G, 9, G, { value: NOTE, fill: WHITE, align: { wrapText: true } });

  put(ws, 8, B, 8, B, { value: 'Назва критерію', bold: true, align: CENTER });
  put(ws, 8, C, 8, C, { value: 'К-сть', bold: true, align: CENTER });
  put(ws, 8, D, 8, D, { value: 'Коефіцієнт', bold: true, align: CENTER });
  put(ws, 8, E, 8, E, { value: 'Бал', bold: true, align: CENTER });
  for (const c of [B, C, D, E]) ws.getCell(8, c).border = { bottom: MEDIUM };

  for (const header of [2, 6, 8]) ws.getRow(header).height = 24;

  let r = 9;
  const scoreCells: string[] = [];

  for (const row of indicators) {
    if (!row.isActive) continue;
    const label = row.label ?? '';
    put(ws, r, A, r, A, {
      value: row.itemNumber,
      bold: true,
      fill: GREY,
      frame: true,
      align: CENTER,
      numFmt: '@',
    });

    if (row.kind === 'HEADING') {
      put(ws, r, B, r, E, { value: label, frame: true, align: CENTER });
      ws.getRow(r).height = heightFor([[label, spanWidth(B, E)]]);
      r++;
      continue;
    }

    const value = values[row.id];
    const score = indicatorScore(row, value);
    const at = `C${r}`;
    put(ws, r, B, r, B, { value: label, frame: true, align: CENTER });

    if (row.kind === 'CHOICE') {
      put(ws, r, C, r, C, {
        value: value === undefined ? null : (row.options[value]?.label ?? null),
        fill: GREEN,
        frame: true,
        align: { horizontal: 'right', wrapText: true },
      });
      put(ws, r, D, r, D, {
        value: row.options.map((o) => o.points).join(' / '),
        frame: true,
        align: CENTER,
      });
      // IF chain over the labels: the points live in the formula, as in the template's SWITCH
      const quote = (s: string) => `"${s.replace(/"/g, '""')}"`;
      const formula = row.options.reduceRight(
        (rest, o) => `IF(${at}=${quote(o.label)},${o.points},${rest})`,
        '0'
      );
      put(ws, r, E, r, E, {
        value: { formula, result: score },
        bold: true,
        frame: true,
        align: CENTER,
      });
      const labels = row.options.map((o) => o.label);
      const list = labels.join(',');
      if (!labels.some((l) => l.includes(',')) && list.length <= 250) {
        ws.getCell(r, C).dataValidation = {
          type: 'list',
          allowBlank: true,
          showErrorMessage: true,
          formulae: [`"${list.replace(/"/g, '""')}"`],
        };
      }
    } else {
      put(ws, r, C, r, C, { value: value ?? null, fill: GREEN, frame: true });
      put(ws, r, D, r, D, { value: row.coefficient, frame: true, align: CENTER });
      put(ws, r, E, r, E, {
        value: { formula: `IF(C${r}>0,C${r}*D${r},0)`, result: score },
        bold: true,
        frame: true,
        align: CENTER,
      });
      // The form's own rule: a whole number from 1; an empty line means none
      ws.getCell(r, C).dataValidation = {
        type: 'whole',
        operator: 'between',
        formulae: [1, 999],
        allowBlank: true,
        showErrorMessage: true,
        error: 'Ціле число від 1 до 999',
      };
    }
    // Montserrat 12 is taller than the default row, and a wrapped label needs its lines
    ws.getRow(r).height = heightFor([[label, WIDTHS[B - 1]]]);
    scoreCells.push(`E${r}`);
    r++;
  }

  put(ws, 6, B, 6, B, { value: 'Всього', bold: true, fill: PEACH, align: CENTER });
  put(ws, 6, C, 6, C, {
    value: scoreCells.length ? { formula: scoreCells.join('+'), result: total } : total,
    bold: true,
    fill: PEACH,
    align: CENTER,
  });

  // ---- Item 14: a header row, the three column titles, then three entries ----
  const boxes14 = INITIATIVE_BOXES(year);
  const head14 = r;
  put(ws, head14, A, head14 + 1, A, {
    value: '14',
    bold: true,
    fill: WHITE,
    frame: true,
    align: LEFT,
    numFmt: '@',
  });
  put(ws, head14, B, head14, F, {
    value: NARRATIVE_TITLES.initiative(year),
    bold: true,
    frame: true,
    align: LEFT,
  });
  const titles14 = boxes14.map(labelOf);
  put(ws, head14 + 1, B, head14 + 1, B, {
    value: titles14[0],
    frame: true,
    align: { ...LEFT, vertical: 'middle' },
  });
  put(ws, head14 + 1, C, head14 + 1, D, {
    value: titles14[1],
    frame: true,
    align: { ...LEFT, vertical: 'middle' },
  });
  put(ws, head14 + 1, E, head14 + 1, F, {
    value: titles14[2],
    frame: true,
    align: { ...LEFT, vertical: 'middle' },
  });
  ws.getRow(head14 + 1).height = heightFor(
    [
      [titles14[0], WIDTHS[B - 1]],
      [titles14[1], spanWidth(C, D)],
      [titles14[2], spanWidth(E, F)],
    ],
    60
  );
  r = head14 + 2;
  // The template has three lines, filled or not
  for (let i = 0; i < 3; i++) {
    const entry = narrative.initiative[i];
    const text = boxes14.map((b) => (entry ? boxText(entry[b.key]) : ''));
    put(ws, r, A, r, A, {
      value: `14.${i + 1}`,
      bold: true,
      fill: WHITE,
      frame: true,
      align: LEFT,
      numFmt: '@',
    });
    put(ws, r, B, r, B, { value: text[0], fill: GREEN, frame: true, align: LEFT });
    put(ws, r, C, r, D, { value: text[1], fill: GREEN, frame: true, align: LEFT });
    put(ws, r, E, r, F, { value: text[2], fill: GREEN, frame: true, align: LEFT });
    ws.getRow(r).height = heightFor(
      [
        [text[0], WIDTHS[B - 1]],
        [text[1], spanWidth(C, D)],
        [text[2], spanWidth(E, F)],
      ],
      36
    );
    r++;
  }

  // ---- Items 15–17: a title row, then label | text rows framed B..D ----
  const rows = (
    number: string,
    title: string,
    list: { label: string; hint?: string; text: string; italic?: boolean }[],
    perRowNumber?: (i: number) => string
  ) => {
    put(ws, r, A, r, A, { value: number, bold: true, frame: true, align: LEFT, numFmt: '@' });
    put(ws, r, B, r, D, { value: title, bold: true, frame: true, align: LEFT });
    ws.getRow(r).height = heightFor([[title, spanWidth(B, D)]], 18.75);
    r++;
    list.forEach((item, i) => {
      if (perRowNumber) {
        put(ws, r, A, r, A, {
          value: perRowNumber(i),
          bold: true,
          frame: true,
          align: LEFT,
          numFmt: '@',
        });
      }
      const label = labelOf(item);
      put(ws, r, B, r, B, { value: label, italic: item.italic, frame: true, align: LEFT });
      put(ws, r, C, r, D, { value: item.text, fill: GREEN, frame: true, align: LEFT });
      ws.getRow(r).height = heightFor(
        [
          [label, WIDTHS[B - 1]],
          [item.text, spanWidth(C, D)],
        ],
        0
      );
      r++;
    });
  };

  // Each study is one block with its number merged down the left, as in the template
  const studyTitle = NARRATIVE_TITLES.studies;
  put(ws, r, A, r, A, { value: '15', bold: true, frame: true, align: LEFT, numFmt: '@' });
  put(ws, r, B, r, D, { value: studyTitle, bold: true, frame: true, align: LEFT });
  ws.getRow(r).height = heightFor([[studyTitle, spanWidth(B, D)]], 18.75);
  r++;
  // The template has two studies, filled or not
  [0, 1].forEach((i) => {
    const study = narrative.studies[i];
    const top = r;
    for (const b of STUDY_BOXES) {
      const label = labelOf(b);
      const text = study ? boxText(study[b.key]) : '';
      put(ws, r, B, r, B, { value: label, frame: true, align: LEFT });
      put(ws, r, C, r, D, { value: text, fill: GREEN, frame: true, align: LEFT });
      ws.getRow(r).height = heightFor(
        [
          [label, WIDTHS[B - 1]],
          [text, spanWidth(C, D)],
        ],
        0
      );
      r++;
    }
    put(ws, top, A, r - 1, A, {
      value: `15.${i + 1}`,
      bold: true,
      frame: true,
      align: LEFT,
      numFmt: '@',
    });
  });

  // 16: the number is merged down through the title and every line
  {
    const top = r;
    const title = NARRATIVE_TITLES.development;
    put(ws, r, B, r, D, { value: title, bold: true, frame: true, align: LEFT });
    ws.getRow(r).height = heightFor([[title, spanWidth(B, D)]], 18.75);
    r++;
    for (const b of DEVELOPMENT_BOXES) {
      const label = labelOf(b);
      const text = boxText(narrative.development[b.key]);
      put(ws, r, B, r, B, { value: label, frame: true, align: LEFT });
      put(ws, r, C, r, D, { value: text, fill: GREEN, frame: true, align: LEFT });
      ws.getRow(r).height = heightFor(
        [
          [label, WIDTHS[B - 1]],
          [text, spanWidth(C, D)],
        ],
        0
      );
      r++;
    }
    put(ws, top, A, r - 1, A, { value: '16', bold: true, frame: true, align: LEFT, numFmt: '@' });
  }

  rows(
    '17',
    NARRATIVE_TITLES.impact,
    [
      { label: IMPACT_KIND_LABEL, text: boxText(narrative.impact.kind), italic: true },
      ...IMPACT_BOXES.map((b) => ({
        label: b.label,
        hint: b.hint,
        text: boxText(narrative.impact[b.key]),
        italic: true,
      })),
    ],
    (i) => `17.${i + 1}`
  );

  return wb;
}
