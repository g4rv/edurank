import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { auth } from '@/lib/auth';
import { getActiveTemplate } from '@/lib/queries/get-active-template';
import { getDashboard } from '@/lib/queries/get-dashboard';
import { getReportData } from '@/lib/queries/get-rating-chart';
import { AnimatedPage } from '@/components/ui/animated-page';
import { StatStrip } from '@/components/dashboard/stat-strip';
import { OrgTree } from '@/components/dashboard/org-tree';
import { ScoreDistribution } from '@/components/dashboard/score-distribution';
import { SectionTotals } from '@/components/dashboard/section-totals';
import { ReportsView } from '@/components/dashboard/reports-view';

const full = new Intl.NumberFormat('uk-UA');

/** Card shell — the overview is a page of them, so the chrome lives in one place */
function Panel({
  title,
  hint,
  action,
  children,
  bodyClassName,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  bodyClassName?: string;
}) {
  return (
    // min-w-0: a grid item defaults to min-width:auto, so without this a wide
    // chart pushes the whole column past the edge of the page
    <section className="min-w-0 rounded-xl border bg-card">
      <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
        <div className="space-y-0.5">
          <h2 className="text-sm font-semibold">{title}</h2>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        {action}
      </div>
      <div className={bodyClassName ?? 'p-4'}>{children}</div>
    </section>
  );
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect('/login');
  // НПП have their own rating page; the university-wide picture is not theirs
  if (session.user.role === 'USER') redirect('/achievements');

  const template = await getActiveTemplate();

  if (!template) {
    return (
      <AnimatedPage className="space-y-6">
        <h1 className="text-2xl font-semibold">Графіки</h1>
        <div className="rounded-xl border bg-card px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            Рейтинговий рік ще не налаштовано, тому показувати поки нічого.
          </p>
          {session.user.role === 'ADMIN' && (
            <Link
              href="/admin/rating"
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
            >
              Налаштувати рейтинговий рік
              <ArrowRight className="size-4" />
            </Link>
          )}
        </div>
      </AnimatedPage>
    );
  }

  const [data, reportData] = await Promise.all([
    getDashboard(template.year),
    getReportData(template.year),
  ]);

  return (
    <AnimatedPage className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Графіки</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {template.year} рік · {template.status === 'CLOSED' ? 'закрито' : 'активний'}
          </p>
        </div>
        <Link
          href="/rating"
          className="inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
        >
          Повний рейтинг
          <ArrowRight className="size-4" />
        </Link>
      </div>

      <StatStrip
        stats={[
          {
            label: 'НПП',
            value: full.format(data.nppCount),
            hint: `та ще ${full.format(data.otherStaffCount)} адміністративних`,
          },
          {
            label: 'Мають бали',
            value: full.format(data.scoredCount),
            hint:
              data.nppCount > 0
                ? `${Math.round((data.scoredCount / data.nppCount) * 100)}% від усіх НПП`
                : undefined,
          },
          {
            label: 'Середній бал',
            value: full.format(Math.round(data.averageScore)),
          },
          {
            label: 'Медіана',
            value: full.format(Math.round(data.medianScore)),
            hint: `найвищий — ${full.format(Math.round(data.topScore))}`,
          },
        ]}
      />

      <Panel
        title="Розподіл балів"
        hint="Скільки НПП потрапило в кожен діапазон. Наведіть на стовпчик, щоб побачити точні межі."
      >
        {data.distribution.length > 0 ? (
          <ScoreDistribution bands={data.distribution} median={data.medianScore} />
        ) : (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Балів цього року ще немає.
          </p>
        )}
      </Panel>

      {/* The report is the hero: filters in a left rail drive the big preview.
          The department ranking lives inside it (кафедра by кафедра, any
          показник, with a PDF), so no separate static «Кафедри» card. */}
      <ReportsView
        year={template.year}
        departments={reportData}
        universityAverage={data.averageScore}
      />

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Panel title="Бали за розділами" hint="Сума по всіх НПП, розділи 1–5 офіційної форми">
          <SectionTotals sections={data.sectionTotals} />
        </Panel>

        <Panel
          title="Структура"
          hint="Факультет → кафедра → скільки НПП"
          bodyClassName=""
          action={
            <Link href="/departments" className="text-xs text-muted-foreground hover:underline">
              Усі кафедри
            </Link>
          }
        >
          <OrgTree faculties={data.faculties} />
        </Panel>
      </div>
    </AnimatedPage>
  );
}
