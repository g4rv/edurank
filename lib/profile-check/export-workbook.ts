import ExcelJS from 'exceljs';
import {
  CHECK_FIELD_LABELS,
  CHECK_STATUS_LABELS,
  METRIC_LABELS,
  PLATFORM_LABELS,
  PLATFORM_STATUS_LABELS,
  emptyCellText,
} from '@/lib/profile-check/labels';
import { PLATFORMS, type Check, type Platform } from '@/lib/profile-check/types';
import type { PlatformCell, ProfileCheckRow } from '@/lib/queries/list-profile-checks';

/**
 * The «Перевірка профілів» list as a workbook (owner, 2026-11-09): a sheet per
 * platform, a row per person, a column per requirement of that platform, and a
 * short text in each cell saying what the profile holds or what is wrong.
 *
 * Colours: a person with an error has the name cell red, and so has every cell
 * that describes an error. Without errors the name is green — also when there
 * is only advice. A doubt («Увага») is amber. A person with no link on the
 * platform is a plain white row with the name alone.
 */

const RED = 'FFF8C9C9';
const GREEN = 'FFD3EDD6';
const AMBER = 'FFFBE6A6';
const HEADER = 'FFB8C4D9';
const GRAY = 'FFE2E2E2';
const FACULTY = 'FFC9D6EE';
const DEPARTMENT = 'FFE7EDF8';

const fill = (argb: string): ExcelJS.Fill => ({
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb },
});

const label = (field: string) => CHECK_FIELD_LABELS[field] ?? METRIC_LABELS[field] ?? field;

/** What a value looks like in one cell: a list is joined, an object is shown as JSON. */
function shown(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (Array.isArray(value)) return value.map(shown).filter(Boolean).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** The text of one check's cell — the value for a fine one, the reason for the rest. */
export function checkText(c: Check): string {
  if (c.field in METRIC_LABELS && c.status === 'ok') {
    const v = c.current as { all: number; recent?: number };
    return v.recent === undefined ? String(v.all) : `${v.all} (за 5 років: ${v.recent})`;
  }
  let value = shown(c.current);
  if (c.field === 'most_recent_work' && c.current && typeof c.current === 'object') {
    const w = c.current as { title?: string; year?: string | null };
    value = w.title ? (w.year ? `${w.title} (${w.year})` : w.title) : '';
  }
  if (value.length > 300) value = `${value.slice(0, 297)}…`;
  if (c.status === 'ok') return value || CHECK_STATUS_LABELS.ok;
  const parts = [c.message ?? CHECK_STATUS_LABELS[c.status]];
  if (value && c.status !== 'info') parts.push(`Зараз: ${value}`);
  return parts.join('\n');
}

const CHECK_FILL: Record<Check['status'], string> = {
  error: RED,
  warning: AMBER,
  // Advice is yellow (owner, 2026-11-09); the person's name stays green, nothing must be fixed
  info: AMBER,
  ok: GREEN,
};

/** Red when the platform holds an error, amber for a doubt, green otherwise. */
function nameFill(cell: PlatformCell): string | null {
  const worst = (s: Check['status']) => cell.checks.some((c) => c.status === s);
  if (cell.status === 'error' || worst('error')) return RED;
  if (cell.status === 'failed') return null;
  if (cell.status === 'warning' || worst('warning')) return AMBER;
  if (cell.status === 'ok') return GREEN;
  return null;
}

/** The requirement columns of one platform, in the order they first appear. */
function fieldsOf(rows: ProfileCheckRow[], p: Platform): string[] {
  const seen: string[] = [];
  for (const r of rows) {
    for (const c of r.cells[p]?.checks ?? []) if (!seen.includes(c.field)) seen.push(c.field);
  }
  return seen;
}

/**
 * The order inside a list (owner, 2026-11-09): all fine, fine with advice only,
 * a doubt, errors, not checked / could not check, and last no profile at all.
 */
function rankOf(r: ProfileCheckRow, p: Platform): number {
  const cell = r.cells[p];
  if (!cell) return r.links[p]?.trim() ? 4 : 5;
  if (nameFill(cell) === RED) return 3;
  if (cell.status === 'failed') return 4;
  if (cell.status === 'no_link') return 5;
  if (nameFill(cell) === AMBER) return 2;
  return cell.checks.some((c) => c.status === 'info') ? 1 : 0;
}

const byUk = (a: string | null, b: string | null) => (a ?? '').localeCompare(b ?? '', 'uk');

export interface ExportOptions {
  /** Faculty and кафедра headings between the people — for the unfiltered list */
  grouped: boolean;
  /** Only people with a problem on any platform — the same people on every sheet */
  onlyProblems: boolean;
}

export function buildProfileChecksWorkbook(
  all: ProfileCheckRow[],
  { grouped, onlyProblems }: ExportOptions
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();

  for (const p of PLATFORMS) {
    const rows = all
      // The same people on every sheet, as on the page; one with no profile here is gray
      .filter((r) => !onlyProblems || r.problem)
      // Факультет and кафедра alphabetically; the best first only INSIDE a кафедра
      .sort(
        (a, b) =>
          byUk(a.faculty, b.faculty) ||
          byUk(a.department, b.department) ||
          rankOf(a, p) - rankOf(b, p) ||
          byUk(a.name, b.name)
      );
    const fields = fieldsOf(rows, p);

    const ws = wb.addWorksheet(PLATFORM_LABELS[p]);
    const lead = grouped ? ['НПП'] : ['НПП', 'Факультет', 'Кафедра'];
    const headers = [...lead, 'Статус', 'Посилання', ...fields.map(label)];
    ws.columns = headers.map((header, i) => ({
      header,
      width:
        i === 0
          ? 38
          : header === 'Факультет'
            ? 34
            : header === 'Кафедра'
              ? 40
              : i < lead.length + 2
                ? 22
                : 42,
    }));
    const head = ws.getRow(1);
    head.font = { bold: true };
    head.alignment = { vertical: 'middle', wrapText: true };
    head.eachCell((c) => {
      c.fill = fill(HEADER);
    });
    ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];

    let faculty: string | null | undefined;
    let department: string | null | undefined;
    for (const r of rows) {
      if (grouped) {
        if (r.faculty !== faculty) {
          faculty = r.faculty;
          department = undefined;
          const h = ws.addRow([faculty ?? 'Без факультету']);
          ws.mergeCells(h.number, 1, h.number, headers.length);
          h.font = { bold: true, size: 12 };
          h.getCell(1).fill = fill(FACULTY);
        }
        if (r.department !== department) {
          department = r.department;
          const h = ws.addRow([department ?? 'Без кафедри']);
          ws.mergeCells(h.number, 1, h.number, headers.length);
          h.font = { bold: true };
          h.getCell(1).fill = fill(DEPARTMENT);
        }
      }

      const cell = r.cells[p];
      const link = cell?.link?.trim() || r.links[p]?.trim() || '';
      const row = ws.addRow(grouped ? [r.name] : [r.name, r.faculty ?? '', r.department ?? '']);
      row.alignment = { vertical: 'middle', wrapText: true };
      // No profile on this platform: the name alone, the whole row gray
      if (!link && !cell) {
        row.height = 30;
        for (let i = 1; i <= headers.length; i++) row.getCell(i).fill = fill(GRAY);
        continue;
      }

      const base = lead.length;
      const status = cell
        ? [PLATFORM_STATUS_LABELS[cell.status], cell.error].filter(Boolean).join('\n')
        : emptyCellText(link);
      row.getCell(base + 1).value = status;
      if (link) {
        row.getCell(base + 2).value = /^https?:\/\//i.test(link)
          ? { text: link, hyperlink: link }
          : link;
      }
      if (!cell) continue;

      const color = nameFill(cell);
      if (color) row.getCell(1).fill = fill(color);
      if (cell.status === 'error') row.getCell(base + 1).fill = fill(RED);
      for (const c of cell.checks) {
        const at = fields.indexOf(c.field);
        if (at < 0) continue;
        const target = row.getCell(base + 3 + at);
        target.value = checkText(c);
        target.fill = fill(CHECK_FILL[c.status]);
      }
    }
  }
  return wb;
}
