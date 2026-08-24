import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getActiveTemplate, listTemplateYears } from '@/lib/queries/get-active-template';
import { listRatings, type RatingSortField } from '@/lib/queries/list-ratings';
import { listFaculties } from '@/lib/queries/list-faculties';
import { listDepartments } from '@/lib/queries/list-departments';
import { AnimatedPage } from '@/components/ui/animated-page';
import { DownloadButton } from '@/components/ui/download-button';
import { RatingFilters } from '@/components/rating/rating-filters';
import { YearSelect } from '@/components/rating/year-select';
import { SortTh } from '@/components/ui/sort-th';
import { DataTable } from '@/components/ui/data-table';
import { RowLinkCell } from '@/components/ui/row-link-cell';
import { cn } from '@/lib/utils';

export default async function RatingRollupPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const session = await auth();
  if (!session) redirect('/login');
  // НПП see their own rating on «Мій рейтинг», not the university-wide list
  if (session.user.role === 'USER') redirect('/achievements');

  const template = await getActiveTemplate();
  if (!template) {
    return (
      <AnimatedPage className="space-y-6">
        <h1 className="text-2xl font-semibold">Рейтинг НПП</h1>
        <div className="rounded-xl border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          Рейтинговий рік ще не налаштовано.
        </div>
      </AnimatedPage>
    );
  }

  // Which year is on screen. The active one by default; any template year on
  // request — a закритий рік is frozen history and worth being able to look at,
  // which is the whole reason `listRatings` keeps archived people in one.
  const activeYear = template.year;
  const templateYears = await listTemplateYears();
  const years = templateYears.map((t) => t.year);
  const asked = Number(params.year);
  const year = years.includes(asked) ? asked : activeYear;
  const shown = templateYears.find((t) => t.year === year);

  const { q, faculty, dept, sort, dir } = params;

  const VALID_SORTS: readonly RatingSortField[] = [
    'name',
    'department',
    's1',
    's2',
    's3',
    's4',
    's5',
    'total',
  ];
  const sortField =
    typeof sort === 'string' && (VALID_SORTS as readonly string[]).includes(sort)
      ? (sort as RatingSortField)
      : 'total';
  const sortDir = dir === 'asc' ? 'asc' : 'desc';

  const [rows, faculties, departments] = await Promise.all([
    listRatings({
      year,
      q: typeof q === 'string' ? q : undefined,
      facultyId: typeof faculty === 'string' ? faculty : undefined,
      departmentId: typeof dept === 'string' ? dept : undefined,
      sort: sortField,
      dir: sortDir,
    }),
    listFaculties(),
    listDepartments(),
  ]);

  // Scores read best highest-first, names A→Я; a column already sorted flips.
  const NUMERIC_FIRST: ReadonlySet<string> = new Set(['total', 's1', 's2', 's3', 's4', 's5']);
  function sortHref(col: RatingSortField) {
    const nextDir =
      sortField === col
        ? sortDir === 'asc'
          ? 'desc'
          : 'asc'
        : NUMERIC_FIRST.has(col)
          ? 'desc'
          : 'asc';
    const sp = new URLSearchParams();
    // Carried, or clicking a column header would drop you back into the active
    // year with the sort applied — the table would change under the click.
    if (year !== activeYear) sp.set('year', String(year));
    if (typeof q === 'string' && q) sp.set('q', q);
    if (typeof faculty === 'string' && faculty) sp.set('faculty', faculty);
    if (typeof dept === 'string' && dept) sp.set('dept', dept);
    sp.set('sort', col);
    sp.set('dir', nextDir);
    return `/rating?${sp.toString()}`;
  }

  return (
    <AnimatedPage className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Рейтинг НПП</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {rows.length} НПП
            {shown?.status === 'CLOSED' && ' · рік закрито'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <YearSelect years={years} value={year} />
          <DownloadButton
            href={`/api/export/ratings?year=${year}`}
            label="Рейтинги (архів)"
            title="Офіційна форма рейтингового оцінювання для кожного НПП"
          />
          <DownloadButton
            href={`/api/export/kharakterystyka?year=${year}`}
            label="Характеристики (архів)"
            title="Характеристика_РНПАВ для кожного НПП за останні 5 років"
          />
        </div>
      </div>

      <RatingFilters
        faculties={faculties.map((f) => ({ id: f.id, name: f.name }))}
        departments={departments.map((d) => ({ id: d.id, name: d.name, facultyId: d.facultyId }))}
      />

      <DataTable>
        <thead>
          <tr className="border-b bg-muted/40 text-left">
            <th className="w-12 px-4 py-3 font-medium text-muted-foreground">№</th>
            <SortTh
              label="ПІБ"
              href={sortHref('name')}
              active={sortField === 'name'}
              dir={sortDir}
            />
            <SortTh
              label="Кафедра"
              href={sortHref('department')}
              active={sortField === 'department'}
              dir={sortDir}
            />
            {[1, 2, 3, 4, 5].map((n) => (
              <SortTh
                key={n}
                label={`Р${n}`}
                title={`Розділ ${n}`}
                href={sortHref(`s${n}` as RatingSortField)}
                active={sortField === `s${n}`}
                dir={sortDir}
                align="right"
                className="w-20 px-3"
              />
            ))}
            <SortTh
              label="Разом"
              href={sortHref('total')}
              active={sortField === 'total'}
              dir={sortDir}
              align="right"
              className="w-24"
            />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id} className="group/row transition-colors">
              <td className="px-4 py-3 text-muted-foreground tabular-nums">{index + 1}</td>
              <RowLinkCell href={`/staff/${row.id}/rating`}>{row.name}</RowLinkCell>
              <td className="px-4 py-3 text-muted-foreground">
                {row.department ?? '—'}
                {/* Another кафедра also pays them a ставка (2026-08-24). Shown
                    on every row, filtered or not, so the кафедра column never
                    tells only half the story. */}
                {row.partTimeDepartments.length > 0 && (
                  <span
                    className="ml-2 inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                    title={`Також працює за сумісництвом: ${row.partTimeDepartments.join(', ')}`}
                  >
                    Сумісник
                  </span>
                )}
              </td>
              {row.sections.map((score, i) => (
                <td
                  key={i}
                  className={cn(
                    'px-3 py-3 text-right tabular-nums',
                    score === 0 && 'text-muted-foreground/50'
                  )}
                >
                  {score}
                </td>
              ))}
              <td className="px-4 py-3 text-right font-semibold tabular-nums">{row.total}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                Нікого не знайдено
              </td>
            </tr>
          )}
        </tbody>
      </DataTable>
    </AnimatedPage>
  );
}
