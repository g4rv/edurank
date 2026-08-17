import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { getActiveTemplate } from '@/lib/queries/get-active-template';
import { listClaimsForReview } from '@/lib/queries/list-student-claims';
import { headOf, scopeOf } from '@/lib/queries/scope';
import { AnimatedPage } from '@/components/ui/animated-page';
import { ClaimsReview } from '@/components/stake/claims-review';
import { DepartmentSelect } from '@/components/department-select';

/**
 * The завідувач rules on the students their staff claim.
 *
 * ADMIN picks a кафедра from the list, the same pattern as /division-data; a
 * head sees theirs. A декан sees every кафедра of their faculty, one section
 * each.
 *
 * **A декан reads and does not decide (2026-08-17).** `scopeOf` says which
 * кафедри they may look at, `headOf` which they may rule on — the same split the
 * ставка grid has used since 2026-08-13. The controls are hidden here and the
 * action refuses independently; a hidden button is a courtesy, never the check.
 */
export default async function DepartmentStudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const query = await searchParams;
  const session = await auth();
  if (!session) redirect('/login');

  const isAdmin = session.user.role === 'ADMIN';
  const [scope, led] = await Promise.all([
    scopeOf(session.user.staffId),
    headOf(session.user.staffId),
  ]);
  if (!isAdmin && scope.length === 0) redirect('/profile');

  const template = await getActiveTemplate();
  if (!template) {
    return (
      <AnimatedPage className="space-y-6">
        <h1 className="text-2xl font-semibold">Залучені здобувачі</h1>
        <div className="rounded-xl border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          Рейтинговий рік ще не налаштовано.
        </div>
      </AnimatedPage>
    );
  }

  const departments = await db.department.findMany({
    where: isAdmin ? {} : { id: { in: scope } },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  // ADMIN works one кафедра at a time — a university-wide list of every claim
  // is not a screen anybody makes a decision from.
  const param = typeof query.department === 'string' ? query.department : undefined;
  const selected = departments.find((d) => d.id === param) ?? departments[0];
  if (!selected) redirect('/profile');

  const claims = await listClaimsForReview(selected.id, template.year);
  const canSwitch = departments.length > 1;
  // Per кафедра, not per person: a декан heads one of their faculty's кафедри
  // often enough, and they decide there and read everywhere else.
  const canDecide = isAdmin || led.includes(selected.id);

  return (
    <AnimatedPage className="space-y-6">
      {!isAdmin && (
        <Link
          href="/my-department"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Моя кафедра
        </Link>
      )}

      {/* Whoever names the кафедра does it once. With the picker on screen the
          heading printed the same words the select already showed, side by
          side, and the control read as a stray duplicate label rather than
          something to press. A head who has only one кафедра has no picker, so
          for them the heading is the only place it can be said. */}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="text-2xl font-semibold">
            Залучені здобувачі
            {!canSwitch && ` — ${selected.name}`}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {template.year} рік ·{' '}
            {canDecide
              ? 'підтверджені заявки враховуються на 2 етапі розподілу ставок'
              : 'лише перегляд — рішення ухвалює завідувач кафедри'}
          </p>
        </div>

        {canSwitch && (
          <div className="space-y-1">
            <span className="block text-xs font-medium text-muted-foreground">Кафедра</span>
            <DepartmentSelect
              departments={departments}
              value={selected.id}
              basePath="/my-department/students"
            />
          </div>
        )}
      </div>

      <ClaimsReview claims={claims} year={template.year} canDecide={canDecide} />
    </AnimatedPage>
  );
}
