import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getActiveTemplate, listTemplateYears } from '@/lib/queries/get-active-template';
import { listRatings, type RatingSortField } from '@/lib/queries/list-ratings';
import { listFaculties } from '@/lib/queries/list-faculties';
import { listDepartments } from '@/lib/queries/list-departments';
import { DownloadButton } from '@/components/ui/download-button';
import { EmptyState } from '@/components/aurora/ui/card';
import { ListHeader } from '@/components/aurora/ui/list-header';
import { SortHead, TableHead, TableRow } from '@/components/aurora/ui/table';
import { RatingFilters } from '@/components/rating/rating-filters';
import { RatingRollupTable } from '@/components/rating/rating-rollup-table';
import { YearSelect } from '@/components/rating/year-select';

export default async function RatingRollupPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const session = await auth();
  if (!session) redirect('/login');
  // НПП see their own rating on their own record, not the university-wide list
  if (session.user.role === 'USER') redirect('/profile');

  const template = await getActiveTemplate();
  if (!template) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-[-0.01em]">Рейтинг НПП</h1>
        <EmptyState>Рейтинговий рік ще не налаштовано.</EmptyState>
      </div>
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

  const head = (
    <TableRow>
      {/* Not sortable: the rank IS the sort, so a chevron on it would promise
          an order it cannot give. */}
      <TableHead numeric align="center">
        №
      </TableHead>
      <SortHead label="ПІБ" href={sortHref('name')} active={sortField === 'name'} dir={sortDir} />
      <SortHead
        label="Кафедра"
        href={sortHref('department')}
        active={sortField === 'department'}
        dir={sortDir}
      />
      {[1, 2, 3, 4, 5].map((n) => (
        <SortHead
          key={n}
          label={`Р${n}`}
          numeric
          align="center"
          href={sortHref(`s${n}` as RatingSortField)}
          active={sortField === `s${n}`}
          dir={sortDir}
          className="px-2"
        />
      ))}
      <SortHead
        label="Разом"
        numeric
        align="center"
        href={sortHref('total')}
        active={sortField === 'total'}
        dir={sortDir}
      />
    </TableRow>
  );

  return (
    // Fills the dashboard's main area: the header card keeps its height and the
    // table takes what is left, scrolling its ~330 rows internally.
    <div className="flex h-full min-h-0 flex-col gap-4">
      <ListHeader
        title="Рейтинг НПП"
        subtitle={
          <>
            {rows.length} НПП
            {shown?.status === 'CLOSED' && ' · рік закрито'}
          </>
        }
        actions={
          <>
            <YearSelect years={years} value={year} />
            <DownloadButton
              href={`/api/export/ratings?year=${year}`}
              label="Рейтинги (.zip)"
              title="Офіційна форма рейтингового оцінювання для кожного НПП"
            />
            <DownloadButton
              href={`/api/export/kharakterystyka?year=${year}`}
              label="Характеристики (.zip)"
              title="Характеристика_РНПАВ для кожного НПП за останні 5 років"
            />
          </>
        }
        filters={
          <RatingFilters
            faculties={faculties.map((f) => ({ id: f.id, name: f.name }))}
            departments={departments.map((d) => ({
              id: d.id,
              name: d.name,
              facultyId: d.facultyId,
            }))}
          />
        }
      />

      <RatingRollupTable rows={rows} head={head} />
    </div>
  );
}
