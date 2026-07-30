import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { getActiveTemplate } from '@/lib/queries/get-active-template';
import { listRatings, type RatingSortField } from '@/lib/queries/list-ratings';
import { listFaculties } from '@/lib/queries/list-faculties';
import { listDepartments } from '@/lib/queries/list-departments';
import { FileDown } from 'lucide-react';
import { AnimatedPage } from '@/components/ui/animated-page';
import { Button } from '@/components/ui/button';
import { RatingFilters } from '@/components/rating/rating-filters';
import { SortTh } from '@/components/ui/sort-th';
import { DataTable } from '@/components/ui/data-table';
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
      year: template.year,
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
            {template.year} рік — {rows.length} НПП
            {template.status === 'CLOSED' && ' (рік закрито)'}
          </p>
        </div>
        <Button asChild variant="outline">
          <a href={`/api/export/ratings?year=${template.year}`} download>
            <FileDown className="size-4" />
            Завантажити архів (Excel)
          </a>
        </Button>
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
            <tr key={row.id} className="transition-colors">
              <td className="px-4 py-3 text-muted-foreground tabular-nums">{index + 1}</td>
              <td className="relative px-4 py-3 font-medium">
                <Link href={`/staff/${row.id}/rating`} className="absolute inset-0" />
                {row.name}
              </td>
              <td className="px-4 py-3 text-muted-foreground">{row.department ?? '—'}</td>
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
