import { db } from '@/lib/db';
import { ON_ROSTER, onDepartments } from './roster';
import { planTarget } from '@/lib/science/target';

export interface SciencePlanRowSummary {
  staffId: string;
  fullName: string;
  departmentId: string;
  departmentName: string;
  /** True where this кафедра is not their primary one — the «Сумісник» badge. */
  isPartTime: boolean;
  rateHundredths: number | null;
  targetHundredths: number | null;
  plannedHundredths: number;
  shortfallHundredths: number | null;
  /** APPROVED draws only — a declined record stops counting at once (D20). */
  doneHundredths: number;
  doneShortfallHundredths: number | null;
  hasPlan: boolean;
}

/**
 * One row per person PER КАФЕДРА — a сумісник appears twice, because they have
 * two plans and each кафедра's head reads their own.
 *
 * `departmentId` alone does not answer «who is on this кафедра»: spread the
 * сумісництво condition (`onDepartments` from roster.ts), the same rule every
 * other «who is on this кафедра» query follows.
 */
export async function listSciencePlans(input: {
  templateId: string;
  departmentIds: readonly string[];
  /** Part of a ПІБ. Matched on the three name columns separately, because the
   *  full name is assembled in JS and no column holds it. */
  q?: string;
}): Promise<SciencePlanRowSummary[]> {
  const template = await db.sciencePlanTemplate.findUnique({
    where: { id: input.templateId },
    select: { id: true, academicYear: true, minHoursPerRate: true, stakeYear: true, status: true },
  });
  if (!template) return [];

  const ids = [...input.departmentIds];
  const q = input.q?.trim();
  const staff = await db.staff.findMany({
    where: {
      ...ON_ROSTER,
      isNpp: true,
      ...onDepartments(ids),
      // `mode: 'insensitive'` matters more here than in a Latin list: somebody
      // typing «іванов» must find «Іванов», and Postgres does not fold
      // Cyrillic case in a plain LIKE.
      ...(q
        ? {
            OR: [
              { lastName: { contains: q, mode: 'insensitive' as const } },
              { firstName: { contains: q, mode: 'insensitive' as const } },
              { patronymic: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      lastName: true,
      firstName: true,
      patronymic: true,
      departmentId: true,
      department: { select: { id: true, name: true } },
      partTimeDepartments: { select: { department: { select: { id: true, name: true } } } },
      sciencePlans: {
        where: { templateId: template.id },
        select: {
          departmentId: true,
          rateHundredths: true,
          rows: { select: { plannedHundredths: true } },
          // APPROVED only: a declined draw holds no hours and must not read as
          // work done — the same filter every other sum over hoursHundredths
          // carries.
          records: { where: { status: 'APPROVED' }, select: { hoursHundredths: true } },
        },
      },
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });

  // Same reasoning as get-science-plan.ts: `SciencePlan.rateHundredths` is a
  // snapshot taken when a plan was saved, and the розподіл it snapshots is
  // usually saved MONTHS later by a different person. While the template is
  // OPEN we read the live розподіл instead — for everyone on screen, planned
  // or not, in one query rather than one per row — so a person who has not
  // planned yet still shows their real target instead of «—». Once the
  // template is CLOSED the live number must stop moving, so we fall back to
  // the frozen `plan.rateHundredths` that was true when the year was decided.
  const staffIds = staff.map((p) => p.id);
  const liveRates = new Map<string, number>();
  if (template.status === 'OPEN' && staffIds.length > 0) {
    const allocations = await db.stakeAllocation.findMany({
      where: {
        staffId: { in: staffIds },
        distribution: { year: template.stakeYear, departmentId: { in: ids } },
      },
      select: {
        staffId: true,
        proposedHundredths: true,
        distribution: { select: { departmentId: true } },
      },
    });
    for (const a of allocations) {
      liveRates.set(`${a.staffId}|${a.distribution.departmentId}`, a.proposedHundredths);
    }
  }

  const rows: SciencePlanRowSummary[] = [];
  for (const person of staff) {
    // Every кафедра this person actually holds — primary, then each
    // additional one — restricted to the ones the caller asked about. A
    // сумісник on a третя кафедра nobody asked for must not produce a row.
    const places = [
      ...(person.department ? [{ dept: person.department, isPartTime: false }] : []),
      ...person.partTimeDepartments.map((p) => ({ dept: p.department, isPartTime: true })),
    ].filter((p) => ids.includes(p.dept.id));

    for (const place of places) {
      const plan = person.sciencePlans.find((p) => p.departmentId === place.dept.id);
      const plannedHundredths = (plan?.rows ?? []).reduce((sum, r) => sum + r.plannedHundredths, 0);
      const doneHundredths = (plan?.records ?? []).reduce((sum, r) => sum + r.hoursHundredths, 0);
      const rateHundredths =
        template.status === 'OPEN'
          ? (liveRates.get(`${person.id}|${place.dept.id}`) ?? null)
          : (plan?.rateHundredths ?? null);
      const target = planTarget({
        minHoursPerRate: template.minHoursPerRate,
        rateHundredths,
        plannedHundredths,
        doneHundredths,
      });
      rows.push({
        staffId: person.id,
        fullName: [person.lastName, person.firstName, person.patronymic].filter(Boolean).join(' '),
        departmentId: place.dept.id,
        departmentName: place.dept.name,
        isPartTime: place.isPartTime,
        ...target,
        hasPlan: Boolean(plan),
      });
    }
  }
  return rows;
}
