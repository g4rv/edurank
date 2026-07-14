import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { getActiveTemplate } from '@/lib/queries/get-active-template';
import { listRatings } from '@/lib/queries/list-ratings';
import { listFaculties } from '@/lib/queries/list-faculties';
import { listDepartments } from '@/lib/queries/list-departments';
import { AnimatedPage } from '@/components/ui/animated-page';
import { RatingFilters } from '@/components/rating/rating-filters';
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

  const { q, faculty, dept } = params;

  const [rows, faculties, departments] = await Promise.all([
    listRatings({
      year: template.year,
      q: typeof q === 'string' ? q : undefined,
      facultyId: typeof faculty === 'string' ? faculty : undefined,
      departmentId: typeof dept === 'string' ? dept : undefined,
    }),
    listFaculties(),
    listDepartments(),
  ]);

  return (
    <AnimatedPage className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Рейтинг НПП</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {template.year} рік — {rows.length} НПП
          {template.status === 'CLOSED' && ' (рік закрито)'}
        </p>
      </div>

      <RatingFilters
        faculties={faculties.map((f) => ({ id: f.id, name: f.name }))}
        departments={departments.map((d) => ({ id: d.id, name: d.name, facultyId: d.facultyId }))}
      />

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left">
              <th className="w-12 px-4 py-3 font-medium text-muted-foreground">№</th>
              <th className="px-4 py-3 font-medium text-muted-foreground">ПІБ</th>
              <th className="px-4 py-3 font-medium text-muted-foreground">Кафедра</th>
              {[1, 2, 3, 4, 5].map((n) => (
                <th
                  key={n}
                  className="w-20 px-3 py-3 text-right font-medium text-muted-foreground"
                  title={`Розділ ${n}`}
                >
                  Р{n}
                </th>
              ))}
              <th className="w-24 px-4 py-3 text-right font-medium text-muted-foreground">Разом</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={row.id}
                className="relative border-b transition-colors last:border-0 hover:bg-muted/30"
              >
                <td className="px-4 py-3 text-muted-foreground tabular-nums">{index + 1}</td>
                <td className="px-4 py-3 font-medium">
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
        </table>
      </div>
    </AnimatedPage>
  );
}
