/**
 * «135 → 1,35» for an hour figure — the same shape `lib/stake/units.ts` uses
 * for a ставка, because both are INTEGER HUNDREDTHS.
 *
 * Kept apart from `formatStake` deliberately: a ставка's formatter always
 * prints two decimals, because a ставка is typed into a field that takes two.
 * Hours are not. Додаток III prints «500», not «500,00», and almost every
 * value here lands whole — a FIXED item, a SELECT item — while a page-based
 * one like an article can genuinely land on «20,83».
 *
 * Lived in `components/science/plan-total.tsx` until `lib/science/pool.ts`
 * became its second caller. §11 of `docs/aurora.md`: one caller means keep it
 * local, a second caller is what moves it — and the original is repointed in
 * the same commit, or you end up with two of them.
 */
export function formatHours(hundredths: number): string {
  const value = hundredths / 100;
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace('.', ',');
}
