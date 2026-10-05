import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getStaff } from '@/lib/queries/get-staff';
import { getActiveScienceTemplate } from '@/lib/queries/get-science-template';
import { planDepartmentsFor, getSciencePlan } from '@/lib/queries/get-science-plan';
import { canOverseeScience } from '@/lib/science/oversight';
import { pickPlanDepartment } from '@/lib/science/plan-department';
import { toPlanWorkType } from '@/lib/science/to-plan-work-type';
import { EmptyState } from '@/components/aurora/ui/card';
import { PlanView } from '@/components/science/plan-view';
import type { PlanTab } from '@/components/science/record-tabs';
import { RecordTabRow } from '@/components/staff/profile/record-tab-row';

/**
 * «Наукова робота» — one НПП's plan and records, as they see them on
 * /science-plan, read-only (owner, 2026-10-05).
 *
 * **ADMIN and «Перевірка науки» only** (D43, `canOverseeScience`): the people
 * who already see every кафедра's science on /science-plans. A завідувач and a
 * декан see no science data at all (D44), so for anybody else this route does
 * not exist — `notFound`, not a redirect, the same as an unknown id.
 *
 * Looking only. Declining a record stays on /moderation and reopening a plan on
 * /science-plans, where the reason and the audit trail already live.
 */
export default async function StaffSciencePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const session = await auth();
  if (!session) redirect('/login');

  if (!(await canOverseeScience(session.user))) notFound();

  const staff = await getStaff(id);
  // Science is planned by НПП only; an administrative record has no tab for it.
  if (!staff?.isNpp) notFound();

  const basePath = `/staff/${id}/science`;
  const tabRow = <RecordTabRow staffId={id} showRating showScience />;

  const departments = await planDepartmentsFor(id);
  if (departments.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-5">
        {tabRow}
        <EmptyState>Працівник не належить до жодної кафедри.</EmptyState>
      </div>
    );
  }

  const template = await getActiveScienceTemplate();
  if (!template) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-5">
        {tabRow}
        <EmptyState>Планування наукової роботи на цей рік ще не відкрито.</EmptyState>
      </div>
    );
  }

  const departmentId = pickPlanDepartment(
    typeof query.dept === 'string' ? query.dept : undefined,
    staff.department?.id,
    departments
  );
  const tab: PlanTab = query.tab === 'done' ? 'done' : 'plan';

  const { plan, rows, records, deferred, target } = await getSciencePlan(
    id,
    departmentId,
    template.id
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      {tabRow}
      <PlanView
        academicYear={template.academicYear}
        lastExecutionMonth={template.lastExecutionMonth}
        orderRef={template.orderRef}
        departments={departments}
        currentDepartmentId={departmentId}
        tab={tab}
        rows={rows}
        records={records}
        deferred={deferred}
        target={target}
        workTypes={template.workTypes.map(toPlanWorkType)}
        lockedAt={plan?.lockedAt ?? null}
        coauthorCandidates={[]}
        readOnly
        basePath={basePath}
      />
    </div>
  );
}
