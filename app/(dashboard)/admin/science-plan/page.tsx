import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { YearList } from '@/components/science/admin/year-list';

const CRUMBS = [{ label: 'Адміністрування' }, { label: 'Планування наукової роботи' }];

/**
 * ADMIN's year list for Додаток III planning — create, clone, open, close.
 * Follows `/admin/rating`'s shape (its sibling, per the task brief): one table,
 * a row of actions per year, «Клонувати» offered only from the newest year.
 *
 * Queries `db` directly rather than `listScienceTemplates` because this list
 * also needs each year's work-type COUNT, which that query does not select —
 * `/admin/rating/page.tsx` makes the same call for the same reason.
 */
export default async function ScienceYearsPage() {
  const session = await auth();
  if (!session) redirect('/login');
  if (session.user.role !== 'ADMIN') redirect('/');

  const templates = await db.sciencePlanTemplate.findMany({
    select: {
      id: true,
      academicYear: true,
      orderRef: true,
      minHoursPerRate: true,
      stakeYear: true,
      status: true,
      _count: { select: { workTypes: true } },
    },
    orderBy: { academicYear: 'desc' },
  });

  return (
    <div className="space-y-5">
      <Breadcrumbs items={CRUMBS} />
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.01em]">
          Роки планування наукової роботи
        </h1>
        <p className="mt-0.5 text-sm text-foreground-soft">
          Каталоги Додатка III за навчальними роками: створення, клонування, відкриття та закриття
        </p>
      </div>
      <YearList
        years={templates.map((t) => ({
          id: t.id,
          academicYear: t.academicYear,
          orderRef: t.orderRef,
          minHoursPerRate: t.minHoursPerRate,
          stakeYear: t.stakeYear,
          status: t.status,
          workTypeCount: t._count.workTypes,
        }))}
      />
    </div>
  );
}
