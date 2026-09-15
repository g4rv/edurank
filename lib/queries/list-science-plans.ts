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
}): Promise<SciencePlanRowSummary[]> {
  const template = await db.sciencePlanTemplate.findUnique({
    where: { id: input.templateId },
    select: { id: true, academicYear: true, minHoursPerRate: true },
  });
  if (!template) return [];

  const ids = [...input.departmentIds];
  const staff = await db.staff.findMany({
    where: {
      ...ON_ROSTER,
      isNpp: true,
      ...onDepartments(ids),
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
        },
      },
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });

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
      const target = planTarget({
        minHoursPerRate: template.minHoursPerRate,
        rateHundredths: plan?.rateHundredths ?? null,
        plannedHundredths,
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
