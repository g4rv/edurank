/**
 * D41 — «Виконано» reads as a diary of the year, one section per month,
 * newest first. `"YYYY-MM"` keys sort correctly as strings, so no date maths.
 * The order inside a month is the caller's (newest entered first).
 */
export function groupByMonth<T extends { executedMonth: string }>(
  rows: readonly T[]
): { month: string; rows: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const group = groups.get(row.executedMonth);
    if (group) group.push(row);
    else groups.set(row.executedMonth, [row]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([month, rows]) => ({ month, rows }));
}
