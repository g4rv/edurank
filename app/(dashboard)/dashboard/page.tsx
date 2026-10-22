import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { auth } from '@/lib/auth';
import { getActiveTemplate, listTemplateYears } from '@/lib/queries/get-active-template';
import { getDashboard } from '@/lib/queries/get-dashboard';
import { getReportData } from '@/lib/queries/get-rating-chart';
import { getYearTrend } from '@/lib/queries/get-year-trend';
import { getTopStaff } from '@/lib/queries/get-top-staff';
import { listDepartmentReports } from '@/lib/queries/list-department-reports';
import { YearSelect } from '@/components/rating/year-select';
import { KpiCards } from '@/components/dashboard/kpi-cards';
import { OrgTree } from '@/components/dashboard/org-tree';
import { ScoreCharts } from '@/components/dashboard/score-charts';
import { ReportsView } from '@/components/dashboard/reports-view';

const full = new Intl.NumberFormat('uk-UA');

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const session = await auth();
  if (!session) redirect('/login');
  // НПП have their own record; the university-wide picture is not theirs.
  // `/profile` and not `/profile/rating`: the rating is a tab of it now, and a
  // non-НПП USER has no rating tab to be sent to.
  if (session.user.role === 'USER') redirect('/profile');

  const template = await getActiveTemplate();

  if (!template) {
    return (
      <div className="space-y-6">
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
      </div>
    );
  }

  // Which year the charts describe. The active one by default; any template
  // year on request — a closed year is frozen history and is exactly what
  // somebody comparing «this year against last» came here to see.
  const templateYears = await listTemplateYears();
  const years = templateYears.map((t) => t.year);
  const asked = Number(params.year);
  const year = years.includes(asked) ? asked : template.year;
  const shown = templateYears.find((t) => t.year === year) ?? template;

  // The кафедри's own reports are the head's work, and the spec gave editors no
  // sight of them: the «Звіт кафедри» tab is ADMIN's.
  const [data, reportData, trend, top, reports] = await Promise.all([
    getDashboard(year),
    getReportData(year),
    getYearTrend(),
    getTopStaff(year),
    session.user.role === 'ADMIN' ? listDepartmentReports(year, 'all') : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Графіки</h1>
          <p className="mt-0.5 text-sm text-foreground-soft">
            {year} рік · {shown.status === 'CLOSED' ? 'закрито' : 'активний'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <YearSelect years={years} value={year} />
          {/* Carries the year across, so «Повний рейтинг» opens the same one
              that is on screen rather than jumping back to the active year. */}
          <Link
            href={year === template.year ? '/rating' : `/rating?year=${year}`}
            className="inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
          >
            Повний рейтинг
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>

      <KpiCards
        items={[
          {
            label: 'НПП',
            value: full.format(data.nppCount),
            hint: `та ще ${full.format(data.otherStaffCount)} адміністративних`,
          },
          {
            label: 'Мають бали',
            value: full.format(data.scoredCount),
            meter: data.nppCount > 0 ? (data.scoredCount / data.nppCount) * 100 : undefined,
            hint:
              data.nppCount > 0
                ? `${Math.round((data.scoredCount / data.nppCount) * 100)}% від усіх НПП`
                : undefined,
          },
          {
            label: 'Середній бал',
            value: full.format(Math.round(data.averageScore)),
            accent: true,
          },
          {
            label: 'Медіана',
            value: full.format(Math.round(data.medianScore)),
            hint: `найвищий — ${full.format(Math.round(data.topScore))}`,
          },
        ]}
      />

      <ScoreCharts
        year={year}
        bands={data.distribution}
        median={data.medianScore}
        trend={trend}
        sections={data.sectionTotals}
      />

      <ReportsView
        year={year}
        departments={reportData}
        reports={reports}
        top={top}
        universityAverage={data.averageScore}
      />

      {/* Eleven факультети and some forty кафедри make the longest block on the
            page, and it is a directory, not a figure: closed until somebody wants it. */}
      <details className="group min-w-0 rounded-xl border bg-card shadow-card">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 marker:hidden [&::-webkit-details-marker]:hidden">
          <span className="space-y-0.5">
            <span className="block text-base font-semibold">Структура</span>
            <span className="block text-sm text-muted-foreground">
              Факультет → кафедра → скільки НПП ({data.faculties.length} факультетів)
            </span>
          </span>
          {/* The whole row is the toggle and nothing in it is a link: a link beside
                the arrow looked like part of it and was a miss-click away from
                leaving the page. */}
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="group-open:hidden">Розгорнути</span>
            <span className="hidden group-open:inline">Згорнути</span>
            <ChevronDown className="size-5 transition-transform group-open:rotate-180" />
          </span>
        </summary>
        <div className="border-t">
          <OrgTree faculties={data.faculties} />
          <div className="border-t px-5 py-3 text-right">
            <Link href="/departments" className="text-sm font-medium hover:underline">
              Усі кафедри
              <ArrowRight className="ml-1 inline size-4" />
            </Link>
          </div>
        </div>
      </details>
    </div>
  );
}
