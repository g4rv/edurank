import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { listDepartments } from '@/lib/queries/list-departments';
import { listProfileChecks } from '@/lib/queries/list-profile-checks';
import { DepartmentSelect } from '@/components/department-select';
import { ProfileCheckRun } from '@/components/admin/profile-check-run';
import { ProfileCheckTable } from '@/components/admin/profile-check-table';
import { getRunState } from './actions';

/**
 * «Перевірка профілів» — ORCID, Web of Science, Scopus and Google Scholar of
 * every НПП, judged against what the university requires of them.
 *
 * ADMIN only, like the invites. The filters are URL params, so a narrowed list
 * is a link and the export acts on exactly what is on screen.
 */
export default async function ProfileCheckPage({
  searchParams,
}: {
  searchParams: Promise<{ department?: string; only?: string }>;
}) {
  const session = await auth();
  if (!session) redirect('/login');
  if (session.user.role !== 'ADMIN') redirect('/');

  const { department, only } = await searchParams;
  const onlyProblems = only === 'problems';

  const [run, all, departments] = await Promise.all([
    getRunState(),
    listProfileChecks({ departmentId: department || undefined }),
    listDepartments(),
  ]);
  const rows = onlyProblems ? all.filter((r) => r.problem) : all;

  function href(next: { only?: string }) {
    const params = new URLSearchParams();
    if (department) params.set('department', department);
    const o = next.only ?? only ?? '';
    if (o) params.set('only', o);
    const query = params.toString();
    return query ? `/admin/profile-check?${query}` : '/admin/profile-check';
  }

  const tab = (active: boolean) =>
    active
      ? 'rounded-lg bg-secondary px-3 py-1.5 font-medium'
      : 'rounded-lg px-3 py-1.5 text-muted-foreground hover:bg-muted';

  const exportParams = new URLSearchParams();
  if (department) exportParams.set('department', department);
  if (onlyProblems) exportParams.set('only', 'problems');
  const exportHref = `/api/export/profile-checks${exportParams.size ? `?${exportParams}` : ''}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Перевірка профілів</h1>
        <p className="mt-0.5 max-w-3xl text-sm text-foreground-soft">
          Профілі НПП в ORCID, Web of Science, Scopus та Google Scholar. Зараз перевіряється лише
          ORCID; решта платформ з’являться, коли будуть задані вимоги. Перевірка йде на сервері —
          сторінку можна закрити.
        </p>
      </div>

      <ProfileCheckRun initial={run} />

      <div className="flex flex-wrap items-center gap-x-2 gap-y-3 text-sm">
        <Link href={href({ only: '' })} className={tab(!onlyProblems)}>
          Усі
        </Link>
        <Link href={href({ only: 'problems' })} className={tab(onlyProblems)}>
          Є проблеми
        </Link>

        <span className="mx-1 hidden h-5 w-px bg-border sm:block" />

        <DepartmentSelect
          departments={departments}
          value={department ?? ''}
          basePath="/admin/profile-check"
          extraParams={only ? { only } : undefined}
          allowAll={{ label: 'Усі кафедри' }}
          className="w-full sm:w-80"
        />

        <span className="text-muted-foreground">
          {rows.length === 0 ? 'нікого' : `${rows.length} осіб`}
        </span>

        {rows.length > 0 && (
          <a href={exportHref} className="ml-auto text-brand-strong hover:underline">
            Вивантажити Excel
          </a>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {all.length === 0
            ? 'Результатів ще немає. Натисніть «Перевірити профілі».'
            : 'За цим фільтром проблем немає.'}
        </p>
      ) : (
        <ProfileCheckTable rows={rows} />
      )}
    </div>
  );
}
