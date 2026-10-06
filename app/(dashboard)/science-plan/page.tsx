import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getStaff } from '@/lib/queries/get-staff';
import { getActiveScienceTemplate } from '@/lib/queries/get-science-template';
import { planDepartmentsFor, getSciencePlan } from '@/lib/queries/get-science-plan';
import { listMyAspirants } from '@/lib/queries/list-my-aspirants';
import { PickListsProvider } from '@/components/rating/pick-lists';
import { listCoauthorCandidates } from '@/lib/queries/list-coauthor-candidates';
import { pickPlanDepartment } from '@/lib/science/plan-department';
import { toPlanWorkType } from '@/lib/science/to-plan-work-type';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { EmptyState } from '@/components/aurora/ui/card';
import { PlanView } from '@/components/science/plan-view';
import type { PlanTab } from '@/components/science/record-tabs';

const CRUMBS = [{ label: 'Особисте' }, { label: 'Планування наукової роботи' }];

/**
 * An НПП's own наукова робота — Додаток III planned and recorded against a
 * target computed from their ставка on ONE кафедра. Read
 * `docs/superpowers/specs/2026-09-15-science-plan-design.md` before changing
 * this page: D6–D9 shape the target, D29 the two tabs.
 *
 * **No year picker, same reason `/achievements/[section]` has none** — this is
 * data entry, and `getActiveScienceTemplate` only ever returns the OPEN year.
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
        <h1 className="text-2xl font-semibold tracking-[-0.01em]">Наукова робота</h1>
        <EmptyState>Ви не належите до жодної кафедри. Зверніться до відділу кадрів.</EmptyState>
      </div>
    );
  }

  const template = await getActiveScienceTemplate();

  if (!template) {
    return (
      <div className="space-y-5">
        <Breadcrumbs items={CRUMBS} />
        <h1 className="text-2xl font-semibold tracking-[-0.01em]">Наукова робота</h1>
        <EmptyState>Планування наукової роботи на цей рік ще не відкрито.</EmptyState>
      </div>
    );
  }

  const departmentId = pickPlanDepartment(
    typeof params.dept === 'string' ? params.dept : undefined,
    staff.department?.id,
    departments
  );

  const tab: PlanTab = params.tab === 'done' ? 'done' : 'plan';

  const { plan, rows, records, deferred, target } = await getSciencePlan(
    staffId,
    departmentId,
    template.id
  );
  const workTypes = template.workTypes.map(toPlanWorkType);
  // Only the «Виконано» tab has a co-author picker, so only it pays for the list.
  const coauthorCandidates = tab === 'done' ? await listCoauthorCandidates(staffId) : [];
  // п.12 names an аспірант from the аспірантура's list, never a typed ПІБ
  // (owner, 2026-10-07) — only the ones this person supervises.
  const aspirants = tab === 'done' ? await listMyAspirants(staffId) : [];

  return (
    // A flex column down to the table, so the plan's `Table` can `fill` the
    // height that is left and scroll its rows inside the card.
    <div className="flex h-full min-h-0 flex-col gap-5">
      <Breadcrumbs items={CRUMBS} />
      <PickListsProvider aspirants={aspirants}>
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
          workTypes={workTypes}
          lockedAt={plan?.lockedAt ?? null}
          coauthorCandidates={coauthorCandidates}
        />
      </PickListsProvider>
    </div>
  );
}
