import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { listDepartments } from '@/lib/queries/list-departments';
import { listProfileChecks } from '@/lib/queries/list-profile-checks';
import { DepartmentSelect } from '@/components/department-select';
import { ProfileCheckRun } from '@/components/admin/profile-check-run';
import { ProfileCheckSearch } from '@/components/admin/profile-check-search';
import { ProfileCheckTable } from '@/components/admin/profile-check-table';
import { runCounts, type StoredCell } from '@/lib/profile-check/pending';
import { listPeopleToCheck } from '@/lib/profile-check/people';
import { CHECKERS } from '@/lib/profile-check/platforms';
import { plural } from '@/lib/profile-check/tally';
import { PLATFORMS, type Platform } from '@/lib/profile-check/types';
import { getRunStates } from './actions';

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
  searchParams: Promise<{ department?: string; only?: string; q?: string }>;
}) {
  const session = await auth();
  if (!session) redirect('/login');
  if (session.user.role !== 'ADMIN') redirect('/');

  const { department, only, q: rawQ } = await searchParams;
  const onlyProblems = only === 'problems';
  const q = rawQ?.trim() || undefined;

  const [run, all, departments, people] = await Promise.all([
    getRunStates(),
    listProfileChecks({ departmentId: department || undefined, q }),
    listDepartments(),
    // Everyone a run could ask about, under the same filters — the popup says how many
    listPeopleToCheck(db, { departmentId: department || undefined, q }),
  ]);
  const rows = onlyProblems ? all.filter((r) => r.problem) : all;

  // Per platform, for the run popup: how many people are in scope, and how many of
  // them have no answer yet. «Problems» are that platform's own.
  const implemented = Object.fromEntries(
    PLATFORMS.map((p) => [p, CHECKERS[p].implemented])
  ) as Record<Platform, boolean>;
  const stored = new Map<string, Partial<Record<Platform, StoredCell>>>(
    all.map((r) => [r.staffId, r.cells])
  );
  const counts = Object.fromEntries(
    PLATFORMS.map((p) => [
      p,
      runCounts(
        people,
        stored,
        p,
        onlyProblems
          ? new Set(all.filter((r) => r.problemPlatforms.includes(p)).map((r) => r.staffId))
          : undefined
      ),
    ])
  ) as Record<Platform, { all: number; missing: number }>;
  const filtered = Boolean(department || q || onlyProblems);

  function href(next: { only?: string }) {
    const params = new URLSearchParams();
    if (department) params.set('department', department);
    if (q) params.set('q', q);
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
  if (q) exportParams.set('q', q);
  const exportHref = `/api/export/profile-checks${exportParams.size ? `?${exportParams}` : ''}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Перевірка профілів</h1>
        <p className="mt-0.5 max-w-3xl text-sm text-foreground-soft">
          Профілі НПП в ORCID, Web of Science, Scopus та Google Scholar.
          {process.env.SCOPUS_API_KEY
            ? ' '
            : ' Scopus перевіряється лише за посиланням — для вмісту профілю потрібен ключ Elsevier API (SCOPUS_API_KEY). '}
          Кожна платформа перевіряється окремо, на сервері — сторінку можна закрити.
        </p>
      </div>

      {/* Each button opens a choice; with a filter it covers the people shown, not all */}
      <ProfileCheckRun
        initial={run}
        implemented={implemented}
        filter={{ department: department || undefined, onlyProblems, q }}
        filtered={filtered}
        counts={counts}
      />

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
          extraParams={only || q ? { ...(only ? { only } : {}), ...(q ? { q } : {}) } : undefined}
          allowAll={{ label: 'Усі кафедри' }}
          className="w-full sm:w-80"
        />

        <ProfileCheckSearch initial={q ?? ''} />

        <span className="text-muted-foreground">
          {rows.length === 0
            ? 'нікого'
            : `${rows.length} ${plural(rows.length, 'особа', 'особи', 'осіб')}`}
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
            ? department || q
              ? 'За цим пошуком нікого не знайдено.'
              : 'Результатів ще немає. Натисніть «Перевірити».'
            : 'За цим фільтром проблем немає.'}
        </p>
      ) : (
        <ProfileCheckTable rows={rows} />
      )}
    </div>
  );
}
