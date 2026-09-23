import { cache } from 'react';
import { db } from '@/lib/db';

/**
 * The OPEN planning template with the work types somebody may plan against.
 *
 * `cache()`d per request: the plan page asks for it once for the picker and
 * once to price a row, the same reason `getActiveTemplate` is cached.
 *
 * **There is exactly one OPEN template at a time**, by convention rather than
 * by a constraint — /admin/science-plan closes the previous year before opening
 * the next. `findFirst` on the newest is therefore the right read, and a second
 * OPEN year shows as the newer of the two rather than as an error nobody can act on.
 */
export const getActiveScienceTemplate = cache(async function getActiveScienceTemplate() {
  return db.sciencePlanTemplate.findFirst({
    where: { status: 'OPEN' },
    orderBy: { academicYear: 'desc' },
    select: {
      id: true,
      academicYear: true,
      orderRef: true,
      minHoursPerRate: true,
      stakeYear: true,
      status: true,
      workTypes: {
        where: { isActive: true },
        select: {
          id: true,
          code: true,
          label: true,
          itemNumber: true,
          itemTitle: true,
          shortLabel: true,
          coefficient: true,
          unitNote: true,
          reportingForm: true,
          evidenceFields: true,
          scoring: true,
          maxPerYear: true,
          // The record form branches on these: `sharing` decides whether an
          // hours box is shown at all, `linkRule`/`fileRule` which proof
          // boxes are offered and which are required (D47).
          sharing: true,
          linkRule: true,
          fileRule: true,
        },
        orderBy: { order: 'asc' },
      },
    },
  });
});

export type ScienceTemplate = NonNullable<Awaited<ReturnType<typeof getActiveScienceTemplate>>>;
export type ScienceWorkTypeRow = ScienceTemplate['workTypes'][number];

/** Every planning year, newest first — for the admin list and the year picker. */
export const listScienceTemplates = cache(async function listScienceTemplates() {
  return db.sciencePlanTemplate.findMany({
    select: { id: true, academicYear: true, status: true, orderRef: true, minHoursPerRate: true },
    orderBy: { academicYear: 'desc' },
  });
});
