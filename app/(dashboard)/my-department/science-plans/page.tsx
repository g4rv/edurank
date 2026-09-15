import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { scopeOf } from '@/lib/queries/scope';
import { getActiveScienceTemplate } from '@/lib/queries/get-science-template';
import { listSciencePlans } from '@/lib/queries/list-science-plans';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { EmptyState } from '@/components/aurora/ui/card';
import { DepartmentPlansTable } from '@/components/science/department-plans-table';

const CRUMBS = [{ label: 'Управління' }, { label: 'Плани кафедри' }];

/**
 * A завідувача's read of who on their кафедра has planned their наукова
 * робота — the same screen for a декан, over every кафедра of their
 * факультет. `scopeOf` decides who gets in at all; ADMIN is not this
 * screen's audience and gets a university-wide one in Task 11.
 *
 * **Read only.** This project keeps «may I look» (`scopeOf`) apart from «may
 * I decide» (`headOf`) on purpose, and this page is only the first — there is
 * no edit control here for anybody, head or декан (owner, 2026-09-15).
 */
export default async function DepartmentSciencePlansPage() {
  const session = await auth();
  if (!session) redirect('/login');

  const departmentIds = await scopeOf(session.user.staffId);
  // Oversees nothing = no business here, the same redirect /my-department
  // itself uses for the same reason.
  if (departmentIds.length === 0) redirect('/profile');

  const template = await getActiveScienceTemplate();

  if (!template) {
    return (
      <div className="space-y-5">
        <Breadcrumbs items={CRUMBS} />
        <h1 className="text-2xl font-semibold tracking-[-0.01em]">Плани кафедри</h1>
        <EmptyState>Планування наукової роботи на цей рік ще не відкрито.</EmptyState>
      </div>
    );
  }

  const rows = await listSciencePlans({ templateId: template.id, departmentIds });
  // Only worth a column when the rows can come from more than one кафедра —
  // a завідувач with their own single кафедра does not need it repeated on
  // every row (rule 6).
  const showDepartment = departmentIds.length > 1;

  return (
    <div className="space-y-5">
      <Breadcrumbs items={CRUMBS} />
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.01em]">Плани кафедри</h1>
        <p className="mt-0.5 text-sm text-foreground-soft">
          {template.academicYear} навчальний рік
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState>
          {showDepartment ? 'На жодній із кафедр немає НПП.' : 'На кафедрі немає НПП.'}
        </EmptyState>
      ) : (
        <DepartmentPlansTable rows={rows} showDepartment={showDepartment} />
      )}
    </div>
  );
}
