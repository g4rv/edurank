import { cache } from 'react';
import { db } from '@/lib/db';

/**
 * The active rating template with its NPP-submittable activity types (for the
 * submit form).
 *
 * `cache()`d: deduped per request, so no page can pay for this twice. It was
 * added for the `@toolbar` slot, which asked for the year once for the picker
 * and once for the table; that slot is gone and every caller now asks once, so
 * today this saves nothing. It is kept because the call is not cheap — it drags
 * in every submittable activity type with its JSON — and because the next
 * component that needs the year should not have to think about it. When «which
 * year is it» is the whole question, `activeYear()` below is the light answer.
 */
export const getActiveTemplate = cache(async function getActiveTemplate() {
  return db.ratingTemplate.findFirst({
    where: { isActive: true },
    select: {
      id: true,
      year: true,
      status: true,
      activityTypes: {
        where: { inputSource: 'NPP_SUBMISSION', isActive: true },
        select: {
          id: true,
          code: true,
          label: true,
          itemNumber: true,
          coefficient: true,
          coefficientNote: true,
          evidenceFields: true,
          // The form's schema needs the rule too, not just the fields — a
          // CHECK_SUM type refuses a submission with nothing ticked, and
          // without this the check would only fire server-side.
          scoring: true,
          section: { select: { number: true, title: true } },
        },
        orderBy: [{ section: { number: 'asc' } }, { order: 'asc' }],
      },
    },
  });
});

export type ActiveTemplate = NonNullable<Awaited<ReturnType<typeof getActiveTemplate>>>;
export type SubmittableActivityType = ActiveTemplate['activityTypes'][number];

/**
 * The active template's year, or null — the only year a mutation may write to.
 *
 * **A year is never taken from client input.** The ставка actions used to read
 * `year` out of the payload and trust it, so a request made outside the UI
 * could rewrite a кафедра's ставки for any year that happened to have a `Кст`
 * row — including one already closed and reported (2026-08-17). Callers compare
 * this against what arrived rather than substituting it, because a page left
 * open across a year change should be told to reload, not have its save
 * silently land somewhere else.
 *
 * **Status is deliberately not checked here.** Claims require an OPEN year and
 * check it themselves; ставки must not, because the second distribution phase
 * happens months after the rating year and may well outlive its closing. If
 * that turns out to be wrong, this is the one place to add it.
 *
 * Deliberately light: `getActiveTemplate` drags in every submittable activity
 * type with its JSON, which is a lot of rows to answer «which year is it».
 */
export async function activeYear(): Promise<number | null> {
  const template = await db.ratingTemplate.findFirst({
    where: { isActive: true },
    select: { year: true },
  });
  return template?.year ?? null;
}

/**
 * All template years, newest first (for the year selector on rating views).
 *
 * `cache()`d for the same reason as `getActiveTemplate` above, and with the
 * same caveat: the `@toolbar` slot that asked twice no longer exists, so this
 * dedupes nothing today and is kept for the caller that comes next.
 */
export const listTemplateYears = cache(async function listTemplateYears() {
  return db.ratingTemplate.findMany({
    select: { year: true, status: true, isActive: true },
    orderBy: { year: 'desc' },
  });
});
