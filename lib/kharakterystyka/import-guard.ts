/**
 * Keeps a removed imported line removed (owner, 2026-10-06).
 *
 * Both importers — `import-kharakterystyka-2022-2024.ts` and
 * `kharakterystyka-transfer.ts` — replace a person's IMPORT rows wholesale. A
 * line somebody took out of their Характеристика is kept as a hidden row
 * (`removedAt`) for exactly this moment: the importers leave those rows alone,
 * and drop any incoming row that is the same line, so a re-run can never bring
 * it back.
 *
 * «The same line» is the person, the position and its alternative, the year and
 * the printed text — everything that makes it this line and not another one.
 */
export interface ImportLine {
  staffId: string;
  position: number;
  group: string | null;
  year: number;
  text: string;
}

function lineKey(line: ImportLine): string {
  return [line.staffId, line.position, line.group ?? '', line.year, line.text].join('\u0000');
}

/** The incoming rows minus every line already removed from somebody's document */
export function withoutRemovedLines<T extends ImportLine>(
  incoming: readonly T[],
  removed: readonly ImportLine[]
): { kept: T[]; skipped: number } {
  const gone = new Set(removed.map(lineKey));
  const kept = incoming.filter((line) => !gone.has(lineKey(line)));
  return { kept, skipped: incoming.length - kept.length };
}
