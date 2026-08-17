import { activeYear } from '@/lib/queries/get-active-template';

// One guard, five actions.
//
// Every ставка mutation — `Кст`, the норматив table, the year coefficient, the
// per-person limits, the distribution itself — arrived carrying a `year` from
// the form and wrote against it without ever asking whether that was the year
// the app is actually running. `addStudentClaim` had it right all along: it
// derives the year from the active template and refuses anything else.
//
// The failure this closes is not a typo in a form. It is a request made outside
// the UI naming a year that already has a `Кст` row — a year that has been
// closed, reported and argued over — and rewriting somebody's pay for it, with
// an audit entry that looks perfectly ordinary.

/**
 * Ukrainian message when `year` is not the one the app may write to, else null.
 *
 * Compares rather than substitutes. A page left open across a year change gets
 * told to reload; quietly redirecting its save to the new year would move
 * numbers the person is not looking at, which is worse than refusing.
 */
export async function closedYearProblem(year: number): Promise<string | null> {
  const current = await activeYear();
  if (current === null) return 'Рейтинговий рік ще не налаштовано';
  if (current !== year) {
    return `Цей рік більше не редагується. Актуальний рік — ${current}. Оновіть сторінку`;
  }
  return null;
}
