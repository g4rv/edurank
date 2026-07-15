import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { AnimatedPage } from '@/components/ui/animated-page';
import { RatingYearActions } from '@/components/admin/rating-year-actions';
import { RATING_YEAR_STATUS_LABELS } from '@/lib/rating/labels';
import { cn } from '@/lib/utils';

export default async function RatingAdminPage() {
  const session = await auth();
  if (!session) redirect('/login');
  if (session.user.role !== 'ADMIN') redirect('/');

  const templates = await db.ratingTemplate.findMany({
    select: {
      id: true,
      year: true,
      name: true,
      status: true,
      isActive: true,
      closedAt: true,
      closedBy: { select: { lastName: true, firstName: true, patronymic: true } },
      _count: { select: { activityTypes: true } },
    },
    orderBy: { year: 'desc' },
  });

  const latestYear = templates[0]?.year;

  return (
    <AnimatedPage className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Рейтингові роки</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Шаблони показників за роками: клонування, редагування, закриття року
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left">
              <th className="px-4 py-3 font-medium text-muted-foreground">Рік</th>
              <th className="px-4 py-3 font-medium text-muted-foreground">Назва</th>
              <th className="px-4 py-3 font-medium text-muted-foreground">Показників</th>
              <th className="px-4 py-3 font-medium text-muted-foreground">Статус</th>
              <th className="px-4 py-3 font-medium text-muted-foreground">Закрито</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Дії</th>
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => (
              <tr key={t.id} className="border-b transition-colors last:border-0 hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">
                  <Link
                    href={`/admin/rating/${t.year}`}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    {t.year}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span className="flex items-center gap-2">
                    {t.name}
                    {t.isActive && (
                      <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        Активний
                      </span>
                    )}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground tabular-nums">
                  {t._count.activityTypes}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                      t.status === 'OPEN'
                        ? 'bg-green-500/10 text-green-600'
                        : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {RATING_YEAR_STATUS_LABELS[t.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {t.closedAt
                    ? `${t.closedAt.toLocaleDateString('uk-UA')}${
                        t.closedBy
                          ? ` — ${t.closedBy.lastName} ${t.closedBy.firstName.charAt(0)}.`
                          : ''
                      }`
                    : '—'}
                </td>
                <td className="px-4 py-3">
                  <RatingYearActions
                    year={t.year}
                    status={t.status}
                    isActive={t.isActive}
                    isLatest={t.year === latestYear}
                  />
                </td>
              </tr>
            ))}
            {templates.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  Ще немає жодного рейтингового року
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AnimatedPage>
  );
}
