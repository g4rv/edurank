import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { getActiveTemplate } from '@/lib/queries/get-active-template';
import { listClaimsForReview } from '@/lib/queries/list-student-claims';
import { scopeOf } from '@/lib/queries/scope';
import { AnimatedPage } from '@/components/ui/animated-page';
import { ClaimsReview } from '@/components/stake/claims-review';
import { DepartmentSelect } from '@/components/department-select';

/**
 * ADMIN rules on the students staff claim; everybody else reads.
 *
 * ADMIN picks a кафедра from the list, the same pattern as /division-data; a
 * head sees theirs. A декан sees every кафедра of their faculty, one section
 * each.
 *
 * **Only ADMIN decides (owner, 2026-08-25)**, retracting «admin/head can
 * approve» of 2026-08-17. A confirmed claim pays a bonus out of a fund the
 * завідувач then spends, so the head is no longer the one confirming it.
 *
 * A head keeps the page read-only, which is what a декан has always had:
 * `scopeOf` still says which кафедри they may look at, and the duplicate list is
 * the reason to keep looking — it is context for their own ставка grid. The
 * controls are hidden here and the action refuses independently; a hidden button
 * is a courtesy, never the check.
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
  // `headOf` is deliberately not consulted: since 2026-08-25 headship grants
  // nothing on this screen, so the only question left is who may LOOK.
  const scope = await scopeOf(session.user.staffId);
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

  if (departments.length === 0) redirect('/profile');

  // «Усі кафедри» is the default (owner, 2026-08-26), reversing «ADMIN works one
  // кафедра at a time». Claims are sparse — most кафедри have none in a given
  // year — so opening on one of thirty-one meant clicking through the empty
  // ones to find the few with anything to decide. An absent `?department=` is
  // all of them; picking one narrows.
  const param = typeof query.department === 'string' ? query.department : undefined;
  const selected = departments.find((d) => d.id === param) ?? null;

  const claims = await listClaimsForReview(
    selected ? [selected.id] : departments.map((d) => d.id),
    template.year
  );
  const canSwitch = departments.length > 1;
  const canDecide = isAdmin;
  // Only worth a column when the rows can come from more than one of them.
  const showDepartment = !selected && canSwitch;

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
            {!canSwitch && ` — ${departments[0]!.name}`}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {template.year} рік ·{' '}
            {canDecide
              ? 'підтверджені заявки враховуються на 2 етапі розподілу ставок'
              : 'лише перегляд — рішення ухвалює адміністратор'}
          </p>
        </div>

        {canSwitch && (
          <div className="space-y-1">
            <span className="block text-xs font-medium text-muted-foreground">Кафедра</span>
            <DepartmentSelect
              departments={departments}
              value={selected?.id ?? ''}
              allowAll={{ label: 'Усі кафедри' }}
              basePath="/my-department/students"
            />
          </div>
        )}
      </div>

      <ClaimsReview
        claims={claims}
        year={template.year}
        canDecide={canDecide}
        showDepartment={showDepartment}
      />
    </AnimatedPage>
  );
}
