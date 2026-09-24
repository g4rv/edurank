import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { getActiveTemplate } from '@/lib/queries/get-active-template';
import { listClaimsForReview } from '@/lib/queries/list-student-claims';
import { headOf } from '@/lib/queries/scope';
import { EmptyState } from '@/components/aurora/ui/card';
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
 * A head keeps the page read-only: the duplicate list is context for their own
 * ставка grid. The controls are hidden here and the action refuses
 * independently; a hidden button is a courtesy, never the check. **A декан no
 * longer sees it at all** (owner, 2026-09-24) — «Мій факультет» is information
 * about their кафедри and staff, and nothing else.
 *
 * **The screen's body is `ClaimsReview`, header card included** (2026-09-21).
 * Searching by здобувач, by НПП and «лише спірні» are client state over rows
 * already sent, so the component that filters owns the band that filters. What
 * stays here is what only the server can answer — who may look, who may decide,
 * and the кафедра picker, which changes what is FETCHED rather than what is
 * shown.
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
  // Who may LOOK: the кафедра's head, or ADMIN. Headship decides nothing here
  // (only ADMIN rules on a claim, 2026-08-25), and a декан is out since
  // 2026-09-24 — «Мій факультет» is their кафедри and staff, nothing else.
  const scope = await headOf(session.user.staffId);
  if (!isAdmin && scope.length === 0) redirect('/profile');

  const template = await getActiveTemplate();
  if (!template) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-[-0.01em]">Залучені здобувачі</h1>
        <EmptyState>Рейтинговий рік ще не налаштовано.</EmptyState>
      </div>
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
  // Only worth showing when the rows can come from more than one of them.
  const showDepartment = !selected && canSwitch;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {!isAdmin && (
        <Link
          href="/my-department"
          className="inline-flex shrink-0 items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Моя кафедра
        </Link>
      )}

      <ClaimsReview
        claims={claims}
        year={template.year}
        canDecide={canDecide}
        showDepartment={showDepartment}
        // Whoever names the кафедра does it once. With the picker on screen the
        // heading printed the same words the select already showed, side by
        // side. A head who has only one кафедра has no picker, so for them the
        // heading is the only place it can be said.
        title={`Залучені здобувачі${!canSwitch ? ` — ${departments[0]!.name}` : ''}`}
        subtitle={
          <>
            {template.year} рік ·{' '}
            {canDecide
              ? 'підтверджені заявки враховуються на 2 етапі розподілу ставок'
              : 'лише перегляд — рішення ухвалює адміністратор'}
          </>
        }
        departmentSelect={
          canSwitch ? (
            <DepartmentSelect
              departments={departments}
              value={selected?.id ?? ''}
              allowAll={{ label: 'Усі кафедри' }}
              basePath="/my-department/students"
              className="w-full"
            />
          ) : undefined
        }
      />
    </div>
  );
}
