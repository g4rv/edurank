import { db } from '@/lib/db';
import { getActiveScienceTemplate } from '@/lib/queries/get-science-template';
import { planDepartmentsFor } from '@/lib/queries/get-science-plan';
import { planGate, type PlanGate } from '@/lib/science/plan-gate';

/**
 * May this НПП fill in their rating yet? See `lib/science/plan-gate.ts` for
 * the rule; this only gathers what it needs.
 *
 * The кафедри come from `planDepartmentsFor` — the list /science-plan itself
 * offers — so the gate can never ask for a plan the page has no tab for.
 *
 * A closed gate also says which of those кафедри have no ставка for the
 * person (`noRate`, the same розподіл `rateForPlan` reads), because there the
 * person cannot save the plan at all and has to be told whom to ask.
 */
export async function getSciencePlanGate(staffId: string): Promise<PlanGate> {
  const template = await getActiveScienceTemplate();
  if (!template) return planGate({ hasOpenYear: false, departments: [], plans: [] });

  const [departments, plans] = await Promise.all([
    planDepartmentsFor(staffId),
    db.sciencePlan.findMany({
      where: { staffId, templateId: template.id },
      select: { departmentId: true, lockedAt: true },
    }),
  ]);

  const gate = planGate({ hasOpenYear: true, departments, plans });
  if (gate.open) return gate;

  const rated = await db.stakeAllocation.findMany({
    where: {
      staffId,
      distribution: {
        year: template.stakeYear,
        departmentId: { in: gate.unsaved.map((d) => d.id) },
      },
    },
    select: { distribution: { select: { departmentId: true } } },
  });
  const ratedIds = new Set(rated.map((a) => a.distribution.departmentId));
  return {
    open: false,
    unsaved: gate.unsaved.map((d) => ({ ...d, noRate: !ratedIds.has(d.id) })),
  };
}
