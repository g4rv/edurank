'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronDown, FileDown, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/aurora/ui/button';
import { SegmentedControl } from '@/components/aurora/ui/segmented-control';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/aurora/ui/select';
import { cn } from '@/lib/utils';
import type { ReportDepartment } from '@/lib/queries/get-rating-chart';
import type { DepartmentReportRow } from '@/lib/queries/list-department-reports';
import {
  METRIC_KEYS,
  METRIC_LABELS,
  TOP_STAFF_COUNT,
  type MetricKey,
  type TopByMetric,
} from '@/lib/dashboard/top-staff';
import { departmentRows, reportRows, staffRows, topStaffRows } from '@/lib/dashboard/ranking';
import { DepartmentCombobox } from '@/components/department-combobox';
import { RankingRows } from '@/components/dashboard/ranking-rows';

// «Рейтинг кафедр». Two rankings of the same кафедри behind one switch: the
// staff's (each кафедра's НПП, any показник, with a PDF — the printed sheet's
// twin) and the кафедра's own report. Both are rows, not a chart: a long
// кафедра name needs a column of its own, which a chart axis cannot give 31 of.

const METRICS: { value: string; label: string }[] = METRIC_KEYS.map((key) => ({
  value: key,
  label: METRIC_LABELS[key],
}));

type View = 'staff' | 'report' | 'top';

const full = new Intl.NumberFormat('uk-UA');

/** How many rows the card shows before «Показати всі» — 31 rows is a page of its own */
const TOP = 5;

export function ReportsView({
  year,
  departments,
  reports,
  top,
  universityAverage,
}: {
  year: number;
  departments: ReportDepartment[];
  /** The кафедри's own reports — only for ADMIN; null hides the switch */
  reports: DepartmentReportRow[] | null;
  /** The best НПП by the total and by each розділ — «Топ-20 НПП» */
  top: TopByMetric;
  universityAverage?: number;
}) {
  const [view, setView] = useState<View>('staff');
  // «all» ranks the кафедри; a кафедра id ranks that кафедра's НПП
  const [target, setTarget] = useState('all');
  const [metric, setMetric] = useState('total');
  // The top-20 has its own показник: going back to the кафедри keeps theirs
  const [topMetric, setTopMetric] = useState<MetricKey>('total');
  const [expanded, setExpanded] = useState(false);

  // «Звіт кафедри» is ADMIN's: without the reports the tab is not drawn
  const views: { value: View; label: string }[] = [
    { value: 'staff', label: 'НПП' },
    ...(reports !== null ? [{ value: 'report' as const, label: 'Звіт кафедри' }] : []),
    { value: 'top', label: `Топ-${TOP_STAFF_COUNT} НПП` },
  ];

  const showReport = view === 'report' && reports !== null;
  const showTop = view === 'top';
  const isAll = target === 'all';
  const metricIdx = metric === 'total' ? null : Number(metric) - 1;
  const showPair = view === 'staff' && !isAll && metricIdx !== null;
  const sectionLabel = metricIdx === null ? 'Загальний бал' : `Розділ ${metric}`;

  const rows = useMemo(() => {
    if (showReport) return reportRows(reports ?? []);
    if (showTop) return topStaffRows(top[topMetric], topMetric !== 'total');
    if (isAll) return departmentRows(departments, metricIdx);
    const dept = departments.find((d) => d.id === target);
    return dept ? staffRows(dept, metricIdx) : [];
  }, [showReport, showTop, reports, top, topMetric, departments, isAll, target, metricIdx]);

  // The PDF is the staff ranking, with the same filters
  const params = new URLSearchParams({
    kind: isAll ? 'departments' : 'staff',
    metric,
    year: String(year),
  });
  if (!isAll) params.set('departmentId', target);
  const href = `/api/export/rating-chart?${params.toString()}`;

  // The spreadsheet is whatever the card shows: the report ranking, one кафедра's
  // НПП, or every кафедра's average
  const excelParams = new URLSearchParams({
    view: showReport ? 'report' : 'staff',
    year: String(year),
  });
  if (!showReport && !isAll) excelParams.set('department', target);
  const excelHref = `/api/export/department-ranking?${excelParams.toString()}`;

  const shown = expanded ? rows : rows.slice(0, TOP);

  const showAverage =
    view === 'staff' && isAll && metricIdx === null && universityAverage !== undefined;

  return (
    <section className="min-w-0 rounded-xl border bg-card shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b px-5 py-4">
        <div className="space-y-0.5">
          <h2 className="text-base font-semibold">Рейтинг</h2>
          <p className="text-sm text-muted-foreground">
            {showReport
              ? `Кафедри за звітом кафедри, ${year} рік. Кафедра без звіту стоїть внизу.`
              : showTop
                ? `${TOP_STAFF_COUNT} НПП за показником «${METRICS.find((m) => m.value === topMetric)?.label}», ${year} рік.`
                : `Кафедри за середнім балом НПП, ${year} рік.`}
          </p>
        </div>
        <SegmentedControl
          aria-label="Який рейтинг показати"
          value={view}
          onChange={setView}
          options={views}
          className="w-auto min-w-96"
        />
      </div>

      {view === 'staff' && (
        <div className="flex flex-wrap items-end gap-4 border-b px-5 py-4">
          <div className="w-full space-y-1 sm:w-72">
            <label className="text-xs font-medium text-muted-foreground">Кафедра</label>
            <DepartmentCombobox
              departments={departments}
              value={isAll ? '' : target}
              onChange={(next) => setTarget(next || 'all')}
              allowAll={{ label: 'Усі кафедри' }}
              placeholder="Кафедра"
            />
          </div>
          <MetricSelect value={metric} onChange={setMetric} />
          <div className="flex gap-2 sm:ml-auto">
            <Button asChild size="sm" variant="outline" title="Завантажити Excel">
              <a href={excelHref} download>
                <FileSpreadsheet className="size-4" />
                Excel
              </a>
            </Button>
            <Button asChild size="sm" variant="outline" title="Завантажити PDF">
              <a href={href} download>
                <FileDown className="size-4" />
                PDF
              </a>
            </Button>
          </div>
        </div>
      )}

      {showTop && (
        <div className="flex flex-wrap items-end gap-4 border-b px-5 py-4">
          <MetricSelect value={topMetric} onChange={(next) => setTopMetric(next as MetricKey)} />
          <div className="flex gap-2 sm:ml-auto">
            <Button asChild size="sm" variant="outline" title="Завантажити Excel">
              <a
                href={`/api/export/department-ranking?view=top&metric=${topMetric}&year=${year}`}
                download
              >
                <FileSpreadsheet className="size-4" />
                Excel
              </a>
            </Button>
            <Button asChild size="sm" variant="outline" title="Завантажити PDF">
              <a
                href={`/api/export/rating-chart?kind=top&metric=${topMetric}&year=${year}`}
                download
              >
                <FileDown className="size-4" />
                PDF
              </a>
            </Button>
          </div>
        </div>
      )}

      {showReport && (
        <div className="flex justify-end gap-2 border-b px-5 py-3">
          <Button asChild size="sm" variant="outline" title="Завантажити Excel">
            <a href={excelHref} download>
              <FileSpreadsheet className="size-4" />
              Excel
            </a>
          </Button>
          <Button asChild size="sm" variant="outline" title="Завантажити PDF">
            <a href={`/api/export/rating-chart?kind=reports&year=${year}`} download>
              <FileDown className="size-4" />
              PDF
            </a>
          </Button>
        </div>
      )}

      <div className="px-5 py-2">
        {rows.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Немає даних для цього вибору.
          </p>
        ) : (
          <RankingRows rows={shown} average={showAverage ? universityAverage : undefined} />
        )}
      </div>

      {rows.length > TOP && (
        <div className="flex justify-center border-t px-5 py-3">
          <Button variant="ghost" size="sm" onClick={() => setExpanded((v) => !v)}>
            {expanded ? `Згорнути до ${TOP}` : `Показати всі ${rows.length}`}
            <ChevronDown className={cn('size-4 transition-transform', expanded && 'rotate-180')} />
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3 text-xs text-muted-foreground">
        {showReport ? (
          <>
            <span>Бали з форми «Звіт кафедри»: проєкти, публікації, конференції.</span>
            <Link
              href="/department-rating"
              className="inline-flex items-center gap-1 font-medium text-foreground hover:underline"
            >
              Усі звіти
              <ArrowRight className="size-3.5" />
            </Link>
          </>
        ) : showTop ? (
          // The total alone is one bar and needs no key; a розділ rides with the total
          topMetric === 'total' ? (
            <span />
          ) : (
            <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-chart-accent" />
                Розділ {topMetric}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-chart-total" />
                Загальний бал
              </span>
            </span>
          )
        ) : showPair ? (
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-chart-accent" />
              {sectionLabel}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-chart-total" />
              Загальний бал
            </span>
          </span>
        ) : showAverage ? (
          <span className="flex items-center gap-2">
            <span className="h-3 border-l-2 border-dashed border-foreground/40" />
            Середнє по університету:{' '}
            <span className="font-medium text-foreground">
              {full.format(Math.round(universityAverage))}
            </span>
          </span>
        ) : (
          <span />
        )}
        <span>
          Показано {shown.length} з {rows.length}
        </span>
      </div>
    </section>
  );
}

/** The показник select — one per view, so each keeps its own choice */
function MetricSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="w-full space-y-1 sm:w-80">
      <label htmlFor="reportMetric" className="text-xs font-medium text-muted-foreground">
        Показник
      </label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id="reportMetric" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {METRICS.map((m) => (
            <SelectItem key={m.value} value={m.value}>
              {m.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
