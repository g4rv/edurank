import type { IndicatorRow, ReportValues } from './score';

/**
 * The form holds text — a count box's digits, a select's value — and the
 * report stores numbers. These two cross between them.
 */

/** A select's «nothing chosen». Radix forbids an empty-string item value. */
export const NO_CHOICE = 'none';

/** Line id → what its box shows */
export type ReportCounts = Record<string, string>;

export function countsFromValues(rows: IndicatorRow[], values: ReportValues): ReportCounts {
  const counts: ReportCounts = {};
  for (const row of rows) {
    if (row.kind === 'HEADING') continue;
    const value = values[row.id];
    counts[row.id] = value === undefined ? (row.kind === 'CHOICE' ? NO_CHOICE : '') : String(value);
  }
  return counts;
}

export function valuesFromCounts(rows: IndicatorRow[], counts: ReportCounts): ReportValues {
  const values: ReportValues = {};
  for (const row of rows) {
    if (row.kind === 'HEADING') continue;
    const text = counts[row.id];
    if (text === undefined || text === '' || text === NO_CHOICE) continue;
    const value = Number(text);
    // A count of 0 is an empty box typed out — not sent (counts run 1–999).
    // A CHOICE's 0 is its first option and stays.
    if (row.kind === 'COUNT' && value === 0) continue;
    values[row.id] = value;
  }
  return values;
}
