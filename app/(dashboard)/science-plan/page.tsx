import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getStaff } from '@/lib/queries/get-staff';
import {
  getActiveScienceTemplate,
  type ScienceWorkTypeRow,
} from '@/lib/queries/get-science-template';
import { planDepartmentsFor, getSciencePlan } from '@/lib/queries/get-science-plan';
import { evidenceFieldsSpecSchema, scoringSpecSchema } from '@/validations/activity-type-spec';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { EmptyState } from '@/components/aurora/ui/card';
import { PlanView } from '@/components/science/plan-view';
import type { PlanWorkType } from '@/components/science/add-plan-row-dialog';

const CRUMBS = [{ label: 'Особисте' }, { label: 'Планування наукової роботи' }];

/** Field specs off the row's JSON; a malformed row degrades to an empty form —
 *  same defensive shape `achievements/[section]/page.tsx` uses for the rating. */
function toPlanWorkType(row: ScienceWorkTypeRow): PlanWorkType {
  const fields = evidenceFieldsSpecSchema.safeParse(row.evidenceFields);
  const scoring = scoringSpecSchema.safeParse(row.scoring);
  return {
    id: row.id,
    code: row.code,
    label: row.label,
    itemNumber: row.itemNumber,
    coefficient: row.coefficient,
    unitNote: row.unitNote,
    reportingForm: row.reportingForm,
    fields: fields.success ? fields.data : [],
    scoring: scoring.success ? scoring.data : { kind: 'FIXED' },
  };
}

/**
 * An НПП's own план — Додаток III planned against a target computed from
 * their ставка on ONE кафедра. Read `docs/superpowers/specs/2026-09-15-science-plan-design.md`
 * before changing this page: D6–D9 are what shape it.
 *
 * **No year picker, same reason `/achievements/[section]` has none** — this is
 * data entry, and `getActiveScienceTemplate` only ever returns the OPEN year.
 * A closed year's read view is a later screen's job (D4: завідувач/ННВ/ADMIN).
 */
export default async function SciencePlanPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const session = await auth();
  if (!session) redirect('/login');

  const staffId = session.user.staffId;
  // Being an НПП is what grants this, not the USER role — same rule
  // `/achievements/[section]` follows for a person's own rating.
  if (!staffId) redirect('/profile');

  const staff = await getStaff(staffId, true);
  if (!staff?.isNpp) redirect('/profile');

  const departments = await planDepartmentsFor(staffId);

  if (departments.length === 0) {
    return (
      <div className="space-y-5">
        <Breadcrumbs items={CRUMBS} />
        <h1 className="text-2xl font-semibold tracking-[-0.01em]">Планування наукової роботи</h1>
        <EmptyState>Ви не належите до жодної кафедри. Зверніться до відділу кадрів.</EmptyState>
      </div>
    );
  }

  const template = await getActiveScienceTemplate();

  if (!template) {
    return (
      <div className="space-y-5">
        <Breadcrumbs items={CRUMBS} />
        <h1 className="text-2xl font-semibold tracking-[-0.01em]">Планування наукової роботи</h1>
        <EmptyState>Планування наукової роботи на цей рік ще не відкрито.</EmptyState>
      </div>
    );
  }

  // `?dept=` when given and this person's; otherwise the primary кафедра when
  // it is one of theirs (a сумісник with no primary has none to fall back to);
  // otherwise the first, sorted, кафедра — which is the whole list for
  // everybody with only one.
  const askedDept = typeof params.dept === 'string' ? params.dept : undefined;
  const primaryId = staff.department?.id;
  const departmentId =
    (askedDept && departments.some((d) => d.id === askedDept) ? askedDept : undefined) ??
    (primaryId && departments.some((d) => d.id === primaryId) ? primaryId : undefined) ??
    departments[0].id;

  const { rows, target } = await getSciencePlan(staffId, departmentId, template.id);
  const workTypes = template.workTypes.map(toPlanWorkType);

  return (
    <div className="space-y-5">
      <Breadcrumbs items={CRUMBS} />
      <h1 className="text-2xl font-semibold tracking-[-0.01em]">Планування наукової роботи</h1>
      <PlanView
        departments={departments}
        currentDepartmentId={departmentId}
        rows={rows}
        target={target}
        workTypes={workTypes}
      />
    </div>
  );
}
