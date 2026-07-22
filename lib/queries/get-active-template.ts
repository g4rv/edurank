import { db } from '@/lib/db';

/** The active rating template with its NPP-submittable activity types (for the submit form) */
export async function getActiveTemplate() {
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
          section: { select: { number: true, title: true } },
        },
        orderBy: [{ section: { number: 'asc' } }, { order: 'asc' }],
      },
    },
  });
}

export type ActiveTemplate = NonNullable<Awaited<ReturnType<typeof getActiveTemplate>>>;
export type SubmittableActivityType = ActiveTemplate['activityTypes'][number];

/** All template years, newest first (for the year selector on rating views) */
export async function listTemplateYears() {
  return db.ratingTemplate.findMany({
    select: { year: true, status: true, isActive: true },
    orderBy: { year: 'desc' },
  });
}
