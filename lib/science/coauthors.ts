import { formatHours } from '@/lib/science/hours';
import { parseStake } from '@/lib/stake/units';

/**
 * Co-authors of a work — who they are and how the pool is divided (owner,
 * 2026-09-30).
 *
 * **The rule.** The person who enters a shared work names its co-authors from
 * the list of НПП and says how many hours each one gets. What is left is the
 * author's own. Nobody joins by themselves and nobody types a share for
 * somebody else: a colleague who was not named is told to agree the hours with
 * the author, who changes the list. That is what stops a pool being carved up
 * by whoever types fastest.
 *
 * The pool itself is still enforced by the actions, inside their transaction.
 * This file is only the arithmetic and the sentences.
 */

export interface CoauthorShare {
  staffId: string;
  hoursHundredths: number;
}

/** What the author keeps: the pool minus everything given to co-authors. */
export function authorShare(totalHundredths: number, shares: readonly CoauthorShare[]): number {
  return totalHundredths - shares.reduce((sum, s) => sum + s.hoursHundredths, 0);
}

/** The sentence to show for a co-author list the pool cannot carry, or `null`. */
export function coauthorsProblem(input: {
  totalHundredths: number;
  authorStaffId: string;
  shares: readonly CoauthorShare[];
}): string | null {
  const { totalHundredths, authorStaffId, shares } = input;

  const seen = new Set<string>();
  for (const s of shares) {
    if (s.staffId === authorStaffId) return 'Ви не можете бути власним співавтором';
    if (!Number.isInteger(s.hoursHundredths) || s.hoursHundredths <= 0) {
      return 'Вкажіть для кожного співавтора кількість годин більше нуля';
    }
    if (seen.has(s.staffId)) return 'Одного співавтора вказано двічі';
    seen.add(s.staffId);
  }

  const given = shares.reduce((sum, s) => sum + s.hoursHundredths, 0);
  // The author keeps a share of their own: an article whose every hour went to
  // somebody else is not the author's record any more, and the rest of the
  // rules (their share follows the pool) assume there is one.
  if (given >= totalHundredths) {
    return `Співавторам віддано ${formatHours(given)} з ${formatHours(totalHundredths)} год — вам має залишитися хоча б трохи`;
  }
  return null;
}

/**
 * Hundredths as the text a person would type back: 15000 → «150», 1250 → «12,5».
 * Used to open the editing form already filled in; no thousands separator, or
 * what is shown would not parse.
 */
export function hoursToInput(hundredths: number): string {
  const whole = Math.floor(hundredths / 100);
  const rest = hundredths % 100;
  if (rest === 0) return String(whole);
  return `${whole},${String(rest).padStart(2, '0').replace(/0$/, '')}`;
}

/** A row of the form: the person's id from the picker, the hours as typed. */
export interface CoauthorRow {
  staffId: string;
  hours: string;
}

/**
 * The form's rows as shares — or the one thing that is wrong with them.
 * A row nobody started (no person, no hours) is not an error: it is the empty
 * row «Додати співавтора» just added.
 */
export function parseCoauthorRows(
  rows: readonly CoauthorRow[]
): { shares: CoauthorShare[] } | { error: string } {
  const shares: CoauthorShare[] = [];
  for (const row of rows) {
    const hours = row.hours.trim();
    if (!row.staffId && !hours) continue;
    if (!row.staffId) return { error: 'Оберіть співавтора зі списку' };
    if (!hours) return { error: 'Вкажіть, скільки годин отримає співавтор' };
    const parsed = parseStake(hours);
    if (parsed === null) return { error: 'Вкажіть години цифрами, наприклад 50 або 12,5' };
    shares.push({ staffId: row.staffId, hoursHundredths: parsed });
  }
  return { shares };
}

/** Ukrainian names are typed with `'`, `’` and `ʼ` interchangeably. */
function normalise(text: string): string {
  return text.toLowerCase().replace(/[’ʼ`']/g, "'");
}

/**
 * Does this person belong in the picker's suggestions for what was typed?
 * Every typed word must appear somewhere in the name or the кафедра, so a
 * second word narrows the list instead of widening it.
 */
export function personMatches(
  query: string,
  person: { name: string; department?: string | null }
): boolean {
  const words = normalise(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalise(`${person.name} ${person.department ?? ''}`);
  return words.every((word) => haystack.includes(word));
}
