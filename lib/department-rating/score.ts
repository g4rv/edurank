import { MAX_COUNT, MIN_COUNT } from '@/validations/department-report';

/**
 * Рейтинг кафедри's arithmetic — a report's values against the year's lines.
 *
 * Pure, so the form's live total and the save's stored one are the same
 * function. Reads the line's `kind`, never its number: what a line pays is the
 * row's `coefficient` or its options' `points`.
 */

export type IndicatorKind = 'HEADING' | 'COUNT' | 'CHOICE';

export interface IndicatorOption {
  label: string;
  points: number;
}

export interface IndicatorRow {
  id: string;
  itemNumber: string;
  label?: string;
  kind: IndicatorKind;
  coefficient: number;
  options: IndicatorOption[];
  isActive: boolean;
}

/** Line id → a count (COUNT) or the chosen option's index (CHOICE) */
export type ReportValues = Record<string, number>;

const round2 = (n: number) => Math.round(n * 100) / 100;

export function indicatorScore(row: IndicatorRow, value: number | undefined): number {
  if (value === undefined) return 0;
  if (row.kind === 'COUNT') return round2(value * row.coefficient);
  if (row.kind === 'CHOICE') return row.options[value]?.points ?? 0;
  return 0;
}

/** «Всього»: every active line, rounded once more at the end so 0,5 steps never drift. */
export function reportTotal(rows: IndicatorRow[], values: ReportValues): number {
  let total = 0;
  for (const row of rows) {
    if (!row.isActive) continue;
    total += indicatorScore(row, values[row.id]);
  }
  return round2(total);
}

/**
 * Ukrainian message when `values` names something it may not, else null.
 *
 * The schema already holds each value to a whole number ≥ 0; this checks it
 * against the year's own lines — a heading, a line of another year, one
 * switched off, a choice with no such option.
 */
export function valuesProblem(rows: IndicatorRow[], values: ReportValues): string | null {
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const [id, value] of Object.entries(values)) {
    const row = byId.get(id);
    if (!row || !row.isActive || row.kind === 'HEADING') {
      return 'Показник не знайдено. Оновіть сторінку';
    }
    if (row.kind === 'CHOICE' && !(value >= 0 && value < row.options.length)) {
      return `Невірне значення в пункті ${row.itemNumber}`;
    }
    // Counts run 1–999 (owner, 2026-10-21); «none» is an absent key, never 0
    if (row.kind === 'COUNT' && value < MIN_COUNT) {
      return `Пункт ${row.itemNumber}: кількість від ${MIN_COUNT} до ${MAX_COUNT}`;
    }
  }
  return null;
}
