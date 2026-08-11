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
 * The завідувач rules on the students their staff claim.
 *
 * ADMIN picks a кафедра from the list, the same pattern as /division-data; a
 * head sees theirs. A декан sees every кафедра of their faculty, one section
 * each.
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

  // ADMIN works one кафедра at a time — a university-wide list of every claim
  // is not a screen anybody makes a decision from.
  const param = typeof query.department === 'string' ? query.department : undefined;
  const selected = departments.find((d) => d.id === param) ?? departments[0];
  if (!selected) redirect('/profile');

  const claims = await listClaimsForReview(selected.id, template.year);

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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Залучені здобувачі — {selected.name}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {template.year} рік · підтверджені заявки додають ставку понад виділені кафедрі
          </p>
        </div>

        {departments.length > 1 && (
          <DepartmentSelect
            departments={departments}
            value={selected.id}
            basePath="/my-department/students"
          />
        )}
      </div>

      <ClaimsReview claims={claims} year={template.year} />
    </AnimatedPage>
  );
}
