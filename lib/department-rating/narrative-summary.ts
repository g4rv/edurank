/**
 * What one entry of items 14–17 shows as a card (owner, 2026-10-21: the boxes
 * moved into popups because the form took too much space). The card names the
 * entry by its first filled box and says how much of it is filled.
 */

/** A box holds text; 17.1's select holds its choice or null */
type Value = string | null | undefined;
type Entry = Record<string, Value>;

/** A box as one line of text */
export function boxText(v: Value): string {
  return typeof v === 'string' ? v.trim() : '';
}

export function entrySummary(
  entry: Entry,
  boxes: readonly { key: string }[]
): { title: string | null; filled: number; total: number } {
  const texts = boxes.map((b) => boxText(entry[b.key]));
  return {
    title: texts.find((t) => t !== '') ?? null,
    filled: texts.filter((t) => t !== '').length,
    total: boxes.length,
  };
}

/** Nothing typed or chosen — a block like this shows its «Заповнити» button, not a card */
export function isBlank(entry: Entry): boolean {
  return Object.values(entry).every((v) => boxText(v) === '');
}
