import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import ExcelJS from 'exceljs';

// Reading the university's own «Рейтинг» sheet.
//
// Shared by the three things that need it — the division import, the register
// import and `import:verify-2025` — because it is the awkward half of the whole
// legacy import and three copies of it would drift apart within a week.
//
// A `Таблиці_Викладачів/<ПІБ>.xlsx` workbook holds the person's whole scored
// table: every indicator of the year, and what they earned against it. It is a
// COMPUTED VIEW — the numbers come from the `Розділ_*` files and the відділи'
// `Дані *` registers — but it is the view the university published, so it is
// what any import has to add up to.

export const ROOT = 'edu-reference/ФАКУЛЬТЕТИ';

export function text(v: unknown): string {
  if (v === null || v === undefined) return '';
  // Excel ate «3.5» as a date, d.m — see docs/legacy-import.md
  if (v instanceof Date) return `${v.getUTCDate()}.${v.getUTCMonth() + 1}`;
  if (typeof v === 'object') {
    const o = v as { richText?: unknown[]; text?: unknown; result?: unknown };
    if (Array.isArray(o.richText)) return o.richText.map(text).join('');
    if (o.text !== undefined) return text(o.text);
    if (o.result !== undefined) return text(o.result);
    return '';
  }
  return String(v);
}

export const tidy = (s: string) => s.replace(/\s+/g, ' ').trim();

/** `_` in a file name is a sanitised apostrophe; `(1)` is a duplicate file */
export const nameKey = (s: string) =>
  tidy(s)
    .toLowerCase()
    .replace(/\(\d+\)\s*$/, '')
    .replace(/[’`_]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

/** Every scored workbook under ФАКУЛЬТЕТИ */
export function workbooks(dir: string = ROOT, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) workbooks(p, out);
    // `~$…` is Excel's lock file for a workbook somebody has open. It is not a
    // workbook and exceljs dies on it with «is this a zip file?», which reads
    // like corrupt data rather than «close the spreadsheet».
    else if (p.includes('Таблиці_Викладачів') && p.endsWith('.xlsx') && !e.startsWith('~$'))
      out.push(p);
  }
  return out;
}

/** The ПІБ a workbook is named for */
export const personOf = (path: string) =>
  (
    path
      .split('/')
      .flatMap((x) => x.split(String.fromCharCode(92)))
      .at(-1) ?? ''
  ).replace(/\.xlsx$/, '');

/**
 * One scored BLOCK of a person's «Рейтинг» sheet.
 *
 * «Отриманий рейтинг» is a merged cell spanning a heading and the choices under
 * it, so the score belongs to the group, not to any one line — exceljs repeats
 * the master's value on every row of the merge. Read row by row, one «80» under
 * 3.14 appears three times: once as 1 місце × 1, once as 3 місце × 2, and once
 * on the heading.
 */
export interface Block {
  itemNumber: string;
  /** column 2 of every line in the merge — the heading and its choices */
  labels: string[];
  /** column 5 — what the person earned against the whole block */
  earned: number;
}

/**
 * A scored row whose indicator cannot be read.
 *
 * The item number is merged down its options, so a row with an empty column 1
 * belongs to the number above it — unless nothing is above it yet. Перхайло
 * Неля's «Науково-педагогічний стаж» (14) and «доцент» (30) open her розділ 1
 * with no number in column 1 at all, and dropping them made her sheet look as
 * though it did not add up: 320 of rows against a subtotal of 364, when 364 was
 * right all along.
 *
 * The section is recoverable — an orphan belongs to the same розділ as the next
 * numbered row beneath it — so the arithmetic can still be checked, and the
 * division import resolves the indicator by matching the label inside that
 * section. Where that is ambiguous, nothing is invented and the row is reported.
 */
export interface Orphan {
  section: number;
  label: string;
  earned: number;
}

export interface Sheet {
  person: string;
  blocks: Block[];
  /** scored rows with no readable indicator — see Orphan */
  orphans: Orphan[];
  /** the five «Всього балів по розділу N» */
  sections: number[];
  /** «Загальна сума балів» */
  total: number;
}

export async function readSheet(path: string): Promise<Sheet | null> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.readFile(path);
  } catch {
    return null;
  }
  const ws = wb.getWorksheet('Рейтинг');
  if (!ws) return null;

  const blocks = new Map<string, Block>();
  const orphans: Orphan[] = [];
  const sections = [0, 0, 0, 0, 0];
  let total = 0;
  let item: string | null = null;
  /**
   * Orphans seen since the last numbered row. Her whole розділ 1 has an empty
   * column 1 — there is not even a section number to latch onto — so the
   * section is taken from whatever numbered row comes NEXT, or from the
   * «Всього балів по розділу N» line that closes the розділ.
   */
  let pending: { label: string; earned: number }[] = [];
  /**
   * The table starts at «Зміст показників». Above it sit the document title,
   * the кафедра and the person's name — and the title row carries the YEAR in
   * the «Отриманий рейтинг» column, so read as data it adds 2025 points to
   * розділ 1 for all 272 of them.
   */
  let started = false;
  const flush = (section: number) => {
    for (const o of pending) orphans.push({ section, ...o });
    pending = [];
  };

  ws.eachRow({ includeEmpty: false }, (row, n) => {
    const a = tidy(text(row.getCell(1).value));
    const label = tidy(text(row.getCell(2).value));
    const value = Number(tidy(text(row.getCell(5).value)).replace(',', '.'));

    // The sheet's own sums, and the section headers between them. Both end the
    // run of the item number merged down column 1 — without this, «Всього балів
    // по розділу 3» lands on whatever indicator closed the section.
    if (!started) {
      if (/Зміст показників/i.test(label)) started = true;
      return;
    }

    const subtotal = /^Всього балів по розділу (\d)/.exec(label);
    if (subtotal) {
      if (Number.isFinite(value)) sections[Number(subtotal[1]) - 1] = value;
      flush(Number(subtotal[1]));
      item = null;
      return;
    }
    if (/^Загальна сума балів/.test(label)) {
      if (Number.isFinite(value)) total = value;
      item = null;
      return;
    }
    if (/^(Всього балів|Загальна сума)/.test(a)) {
      item = null;
      return;
    }
    if (/^\d\.?$/.test(a)) {
      item = null;
      return;
    }

    const numbered = a.match(/^(\d+\.\d+)\.?$/);
    if (numbered) {
      item = numbered[1];
      flush(Number(item.split('.')[0]));
    }
    if (!label) return;
    if (!Number.isFinite(value) || value === 0) return;
    if (!item) {
      pending.push({ label, earned: value });
      return;
    }

    const cell = row.getCell(5);
    // Rows of one merge share a master cell; an unmerged row is its own block
    const key = `${item}|${cell.isMerged ? cell.master.address : `r${n}`}`;
    const block = blocks.get(key) ?? { itemNumber: item, labels: [], earned: value };
    block.labels.push(label);
    blocks.set(key, block);
  });

  return { person: personOf(path), blocks: [...blocks.values()], orphans, sections, total };
}

/** What the sheet awarded this person against each indicator */
export function itemTotals(blocks: Block[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const b of blocks) totals.set(b.itemNumber, (totals.get(b.itemNumber) ?? 0) + b.earned);
  return totals;
}

/** Two floats agree to the cent — the sheet holds two decimals throughout */
export const same = (a: number, b: number) => Math.abs(a - b) < 0.005;
