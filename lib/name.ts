/**
 * «Іваненко Іван Іванович» → «Іваненко І. І.»
 *
 * The form the app names a colleague in: D17's refusal («цей запис уже додав
 * Іваненко І. І.»), and the co-author line under a record.
 *
 * Distinct from `initialsOf` in `components/ui/avatar.tsx`, which takes a whole
 * name STRING and returns two letters for an avatar circle. This one takes the
 * three columns and returns a readable name.
 *
 * Lived unexported inside `record-actions.ts` until `get-science-plan.ts`
 * became its second caller — §11 of `docs/aurora.md` applied one level down
 * from components: one caller means keep it local, a second is what moves it,
 * and the original is repointed in the same commit.
 */
export function initials(p: {
  lastName: string;
  firstName: string;
  patronymic: string | null;
}): string {
  const first = p.firstName ? `${p.firstName[0]}.` : '';
  const middle = p.patronymic ? ` ${p.patronymic[0]}.` : '';
  return `${p.lastName} ${first}${middle}`.trim();
}
