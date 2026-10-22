import { redirect } from 'next/navigation';
import { ListHeader } from '@/components/aurora/ui/list-header';
import { EmptyState } from '@/components/aurora/ui/card';
import { DepartmentReportList } from '@/components/department-rating/report-list';
import { auth } from '@/lib/auth';
import { visibleDepartmentIds } from '@/lib/department-rating/access';
import { activeYear } from '@/lib/queries/get-active-template';
import { listDepartmentReports } from '@/lib/queries/list-department-reports';
import { UK } from '@/lib/plural';

/**
 * Рейтинг кафедри — every кафедра this person may see, ranked by its own
 * report (2026-10-20).
 *
 * ADMIN sees all of them, a декан their факультет. A завідувач of one кафедра is
 * sent straight to its report, as `/stakes` does: a one-row ranking is not a
 * screen anybody needs, and typing the URL behaves the same as the sidebar.
 */
export default async function DepartmentRatingPage() {
  const session = await auth();
  if (!session) redirect('/login');

  const ids = await visibleDepartmentIds(session.user);
  if (ids !== 'all' && ids.length === 0) redirect('/profile');
  if (ids !== 'all' && ids.length === 1) redirect(`/department-rating/${ids[0]}`);

  const year = await activeYear();
  if (year === null) {
    return (
      <div className="space-y-6">
        <ListHeader title="Рейтинг кафедри" subtitle="" />
        <EmptyState>Рейтинговий рік ще не налаштовано.</EmptyState>
      </div>
    );
  }

  const rows = await listDepartmentReports(year, ids);
  const filled = rows.filter((r) => r.totalScore !== null).length;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <ListHeader
        title="Рейтинг кафедри"
        // «54 кафедри · заповнено 1», not «1 з 54 кафедри»: after «з» the noun
        // takes the genitive, which `UK.department` does not produce
        subtitle={`Звіт за ${year} календарний рік · ${UK.department(rows.length)} · заповнено ${filled}`}
      />
      <DepartmentReportList rows={rows} />
    </div>
  );
}
