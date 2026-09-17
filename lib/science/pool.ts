import { formatHours } from '@/lib/science/hours';

/**
 * D14/D16 — one work, one pool of hours, shared by everybody who draws on it.
 *
 * An article worth 200 г gives 200 г in total however many authors draw on it:
 * 150 taken leaves 50. This is deliberately NOT how the rating treats the same
 * article — there, a monograph's points are DIVIDED by the number of
 * співавтори, so each author's score shrinks as the group grows. Додаток III
 * prints no such rule, and the university's answer was a shared pool. Two
 * different sums over one article, on purpose (spec, «What D3 accepts»).
 *
 * INTEGER HUNDREDTHS throughout. This is a quantity divided among people,
 * which is exactly what `lib/stake/units.ts` exists for: the old ставки system
 * used floats for the same job and produced a negative «нерозподілено» — a
 * кафедра that had overspent according to a subtraction and had not according
 * to the people in it.
 *
 * The RULE lives here; the ENFORCEMENT is a transaction that re-reads
 * `drawnByOthers` (see `record-actions.ts`). Two co-authors saving in the same
 * second must not both see 50 free hours and both take them, and no pure
 * function can promise that.
 */

export function remainingHundredths(totalHundredths: number, drawnByOthers: number): number {
  return Math.max(0, totalHundredths - drawnByOthers);
}

export function poolProblem(input: {
  totalHundredths: number;
  drawnByOthers: number;
  requested: number;
}): string | null {
  const { totalHundredths, drawnByOthers, requested } = input;

  if (!Number.isInteger(requested)) return 'Години мають бути цілим числом сотих';
  if (requested <= 0) return 'Вкажіть кількість годин більше нуля';

  const left = remainingHundredths(totalHundredths, drawnByOthers);
  if (requested > left) {
    // Names what is left AND the whole pool, because the two together are the
    // only explanation a second author gets for a number they did not choose.
    return `Залишилось ${formatHours(left)} з ${formatHours(totalHundredths)} год`;
  }
  return null;
}
