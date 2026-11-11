import type { Prisma } from '@/lib/generated/prisma/client';

/**
 * «Зовнішній сумісник» (owner, 2026-11-10) — a person from another institution
 * who works part-time on ONE кафедра. An НПП in every column (profile,
 * Характеристика, qualifications, ставка), but outside the university's own
 * rating system: no rating, no students, no science plan (the plan may come
 * later — one place to change).
 *
 * **Switching it on FREEZES, never deletes.** Whatever the person already holds —
 * rating entries, activities, plans, claims — stays in the database; the rating
 * lists simply stop showing them and every action that would add to them refuses.
 * Switching it off brings it all back unharmed, which is the point: an admin or an
 * editor who flips it by mistake loses nothing. Closed years are history and
 * keep whoever was in them.
 *
 * Who sets it: ADMIN, and an editor whose division was granted the field
 * (`isExternalPartTimer` in `lib/divisions/field-grants.ts`).
 */

/**
 * Everyone who takes part in the university's rating system: an НПП who is not an
 * external part-timer. Spread it where a query used to say `isNpp: true` for the
 * RATING — the ставка queries keep `isNpp: true`, because an external part-timer
 * is still paid out of the кафедра's pool.
 */
export const RATED = {
  isNpp: true,
  isExternalPartTimer: false,
} satisfies Prisma.StaffWhereInput;

/** What a person is told, and what an action answers, when it is refused for this reason */
export const EXTERNAL_PART_TIMER_REFUSAL =
  'Зовнішній сумісник не бере участі в рейтингу, роботі зі здобувачами та плануванні наукової роботи';

/** Does this person take part in the rating system? `isNpp` AND not external. */
export function takesPartInRating(person: {
  isNpp: boolean;
  isExternalPartTimer?: boolean | null;
}): boolean {
  return person.isNpp && !person.isExternalPartTimer;
}

/**
 * For a `ratingEntries: { where: { year, ...OF_RATED_STAFF } }` read in the ставка
 * code: an external part-timer has no rating, so the формула sees 0 and proposes
 * their Мін — whatever frozen entry they may still hold from before the flag.
 */
export const OF_RATED_STAFF = {
  staff: { isExternalPartTimer: false },
} satisfies Prisma.RatingEntryWhereInput;
