import { db } from '@/lib/db';
import { planTarget, rateForPlan, type PlanTarget } from '@/lib/science/target';

/**
 * Every кафедра a person needs a plan on: their primary one (if they have
 * one) plus every additional кафедра through `StaffDepartment`.
 *
 * **An НПП with no primary кафедра still gets their additional one** (owner,
 * 2026-08-26) — `departmentId` being null must never mean «no plan anywhere»,
 * only «no primary». Deduplicated (a person cannot hold the same кафедра
 * twice) and sorted by name for the switcher.
 */
export async function planDepartmentsFor(
  staffId: string
): Promise<Array<{ id: string; name: string }>> {
  const staff = await db.staff.findUnique({
    where: { id: staffId },
    select: {
      department: { select: { id: true, name: true } },
      partTimeDepartments: { select: { department: { select: { id: true, name: true } } } },
    },
  });
  if (!staff) return [];

  const seen = new Map<string, { id: string; name: string }>();
  if (staff.department) seen.set(staff.department.id, staff.department);
  for (const p of staff.partTimeDepartments) {
    if (!seen.has(p.department.id)) seen.set(p.department.id, p.department);
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, 'uk'));
}

export interface SciencePlanRowDetail {
  id: string;
  order: number;
  workTypeId: string;
  workTypeLabel: string;
  itemNumber: string;
  unitNote: string | null;
  details: unknown;
  plannedHundredths: number;
  note: string | null;
}

export interface SciencePlanDetail {
  plan: { id: string; rateHundredths: number | null } | null;
  rows: SciencePlanRowDetail[];
  target: PlanTarget;
}

/**
 * One person's plan on one кафедра, with each row's work type label and the
 * computed `PlanTarget` — pinned shape, a later task consumes it as-is.
 *
 * When no plan row exists yet — the common case in September, per
 * `rateForPlan`'s own measurement — `plan` is `null` and `rows` is empty, but
 * `target` is still computed from a freshly read `rateForPlan`, so the page
 * can show the target before anybody has typed anything.
 */
export async function getSciencePlan(
  staffId: string,
  departmentId: string,
  templateId: string
): Promise<SciencePlanDetail> {
  const template = await db.sciencePlanTemplate.findUnique({
    where: { id: templateId },
    select: { minHoursPerRate: true, stakeYear: true },
  });
  if (!template) {
    // Nothing to compute a target against — a caller passing a bad
    // templateId gets an empty, targetless result rather than a throw.
    return {
      plan: null,
      rows: [],
      target: {
        rateHundredths: null,
        targetHundredths: null,
        plannedHundredths: 0,
        shortfallHundredths: null,
      },
    };
  }

  const plan = await db.sciencePlan.findUnique({
    where: { staffId_departmentId_templateId: { staffId, departmentId, templateId } },
    select: {
      id: true,
      rateHundredths: true,
      rows: {
        select: {
          id: true,
          order: true,
          workTypeId: true,
          workType: { select: { label: true, itemNumber: true, unitNote: true } },
          details: true,
          plannedHundredths: true,
          note: true,
        },
        orderBy: { order: 'asc' },
      },
    },
  });

  if (!plan) {
    const rateHundredths = await rateForPlan(db, {
      staffId,
      departmentId,
      stakeYear: template.stakeYear,
    });
    return {
      plan: null,
      rows: [],
      target: planTarget({
        minHoursPerRate: template.minHoursPerRate,
        rateHundredths,
        plannedHundredths: 0,
      }),
    };
  }

  const plannedHundredths = plan.rows.reduce((sum, r) => sum + r.plannedHundredths, 0);
  return {
    plan: { id: plan.id, rateHundredths: plan.rateHundredths },
    rows: plan.rows.map((r) => ({
      id: r.id,
      order: r.order,
      workTypeId: r.workTypeId,
      workTypeLabel: r.workType.label,
      itemNumber: r.workType.itemNumber,
      unitNote: r.workType.unitNote,
      details: r.details,
      plannedHundredths: r.plannedHundredths,
      note: r.note,
    })),
    target: planTarget({
      minHoursPerRate: template.minHoursPerRate,
      rateHundredths: plan.rateHundredths,
      plannedHundredths,
    }),
  };
}
