/**
 * Rows grouped the way Додаток III itself is numbered — one section per пункт.
 * Shared by «План» and «Виконано», so the two tabs read the same way.
 *
 * By a MAP, not by consecutive runs: rows arrive in the order they were
 * typed, so planning п.1, then п.8, then п.1 again produced two «Пункт 1»
 * groups — a duplicate React key and the same пункт stated twice with two
 * different totals (owner, 2026-09-17). Sorted numerically for the same reason
 * the наказ is: «12» belongs after «8», not between «1» and «8». Inside a
 * пункт the caller's order is kept.
 */
export function groupByItem<T extends { itemNumber: string }>(
  rows: readonly T[]
): { itemNumber: string; rows: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const group = groups.get(row.itemNumber);
    if (group) group.push(row);
    else groups.set(row.itemNumber, [row]);
  }
  return [...groups.entries()]
    .map(([itemNumber, rows]) => ({ itemNumber, rows }))
    .sort((a, b) => Number(a.itemNumber) - Number(b.itemNumber));
}
