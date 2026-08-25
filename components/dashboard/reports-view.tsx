'use client';

import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from 'recharts';
import { FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import { cn } from '@/lib/utils';
import type { ReportDepartment } from '@/lib/queries/get-rating-chart';
import { DepartmentCombobox } from '@/components/department-combobox';

// The report, native and themed: the two filters drive a live Recharts bar
// chart, and «PDF» downloads exactly what the filters describe. It mirrors the
// printed sheet — «Усі кафедри» is one blue series (the кафедра ranking); a
// single кафедра pairs each НПП's total (red) with the chosen розділ (blue),
// the same two bars the circulated PDF puts side by side.

const METRICS: { value: string; label: string }[] = [
  { value: 'total', label: 'Загальний бал' },
  { value: '1', label: 'Розділ 1 — професійний розвиток' },
  { value: '2', label: 'Розділ 2 — навчальна діяльність' },
  { value: '3', label: 'Розділ 3 — науково-інноваційна діяльність' },
  { value: '4', label: 'Розділ 4 — організаційна діяльність' },
  { value: '5', label: 'Розділ 5 — навчально-методичне забезпечення' },
];

const full = new Intl.NumberFormat('uk-UA');
const compact = new Intl.NumberFormat('uk-UA', { notation: 'compact' });

interface Row {
  name: string;
  short: string;
  value: number;
  total: number;
  nppCount: number | null;
}

export function ReportsView({
  year,
  departments,
  universityAverage,
}: {
  year: number;
  departments: ReportDepartment[];
  /** Shown as a small detail in the header on the all-кафедри view */
  universityAverage?: number;
}) {
  // One control: «all» plots every кафедра's average, a department id plots that
  // кафедра's НПП. Either way the question is «which кафедри», so it reads as one.
  const [target, setTarget] = useState('all');
  const [metric, setMetric] = useState('total');

  const isAll = target === 'all';
  const metricIdx = metric === 'total' ? null : Number(metric) - 1;
  // A single кафедра with a розділ chosen shows the paired bars; otherwise one.
  const showPair = !isAll && metricIdx !== null;
  const sectionLabel = metricIdx === null ? 'Загальний бал' : `Розділ ${metric}`;

  const config = {
    total: { label: 'Загальний бал', color: 'var(--chart-total)' },
    value: { label: sectionLabel, color: 'var(--chart-accent)' },
  } satisfies ChartConfig;

  const data: Row[] = useMemo(() => {
    const pick = (sections: number[], total: number) =>
      metricIdx === null ? total : sections[metricIdx];

    if (isAll) {
      return departments
        .map((d) => ({
          name: d.name,
          short: d.name.replace(/^Кафедра\s+/i, ''),
          value: pick(d.avgSections, d.avgTotal),
          total: d.avgTotal,
          nppCount: d.nppCount,
        }))
        .sort((a, b) => b.value - a.value);
    }

    const dept = departments.find((d) => d.id === target);
    if (!dept) return [];
    // Sorted by whatever is plotted: the chosen розділ, or the total
    return dept.staff
      .map((s) => ({
        name: s.name,
        short: s.name,
        value: pick(s.sections, s.total),
        total: s.total,
        nppCount: null,
      }))
      .sort((a, b) => b.value - a.value);
  }, [departments, target, isAll, metricIdx]);

  // The PDF download — same filters, the university's house-style format.
  const params = new URLSearchParams({
    kind: isAll ? 'departments' : 'staff',
    metric,
    year: String(year),
  });
  if (!isAll) params.set('departmentId', target);
  const href = `/api/export/rating-chart?${params.toString()}`;

  // Grow with the rows so one bar does not float in white space, nor twenty
  // squeeze into a smear. Paired rows carry two bars, so they need more room.
  const rowHeight = showPair ? 40 : 28;
  const height = Math.max(180, data.length * rowHeight + 48);

  return (
    <section className="rounded-xl border bg-card">
      <div className="flex flex-col md:flex-row">
        {/* Filters rail — the controls sit beside the preview, not above it. */}
        <div className="shrink-0 space-y-4 border-b p-4 md:w-60 md:border-r md:border-b-0">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-0.5">
              <h2 className="text-sm font-semibold">Звіт</h2>
              <p className="text-xs text-muted-foreground">Рейтинг за {year} рік</p>
            </div>
            <Button asChild size="sm" variant="outline" title="Завантажити PDF">
              <a href={href} download>
                <FileDown className="size-4" />
                PDF
              </a>
            </Button>
          </div>

          {isAll && universityAverage != null && (
            <p className="text-xs text-muted-foreground">
              Середнє по університету:{' '}
              <span className="font-medium text-foreground">
                {full.format(Math.round(universityAverage))}
              </span>
            </p>
          )}

          <div className="space-y-3">
            <div className="w-full space-y-1">
              <label htmlFor="reportTarget" className="text-xs font-medium text-muted-foreground">
                Кафедра
              </label>
              <DepartmentCombobox
                departments={departments}
                value={target === 'all' ? '' : target}
                onChange={(next) => setTarget(next || 'all')}
                allowAll={{ label: 'Усі кафедри' }}
                placeholder="Кафедра"
              />
            </div>

            <LabeledSelect
              id="reportMetric"
              label="Показник"
              value={metric}
              onValueChange={setMetric}
              wrapperClassName="w-full"
            >
              {METRICS.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </LabeledSelect>
          </div>

          {showPair && (
            <div className="space-y-1.5 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span
                  className="size-2.5 rounded-sm"
                  style={{ background: 'var(--chart-total)' }}
                />
                Загальний бал
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="size-2.5 rounded-sm"
                  style={{ background: 'var(--chart-accent)' }}
                />
                {sectionLabel}
              </span>
            </div>
          )}
        </div>

        {/* Preview — the big filter-driven chart */}
        <div className="min-w-0 flex-1 p-4">
          {data.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Немає даних для цього вибору.
            </p>
          ) : (
            <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
              <BarChart
                data={data}
                layout="vertical"
                margin={{ top: 4, right: 44, bottom: 4, left: 0 }}
                barGap={2}
              >
                <CartesianGrid horizontal={false} stroke="var(--border)" />
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="short"
                  tickLine={false}
                  axisLine={false}
                  width={isAll ? 150 : 168}
                  interval={0}
                  className="text-xs"
                />
                <ChartTooltip
                  cursor={false}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const row = payload[0].payload as Row;
                    return (
                      <div className="max-w-64 rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-md">
                        <p className="font-medium">{row.name}</p>
                        {showPair ? (
                          <div className="mt-1 space-y-0.5">
                            <p>Загальний бал: {full.format(Math.round(row.total))}</p>
                            <p>
                              {sectionLabel}: {full.format(Math.round(row.value))}
                            </p>
                          </div>
                        ) : (
                          <p className="mt-1">
                            {full.format(Math.round(row.value))} балів
                            {row.nppCount !== null && ` · ${row.nppCount} НПП`}
                          </p>
                        )}
                      </div>
                    );
                  }}
                />
                {/* Blue section bar declared first, red total bar last — Recharts
                  stacks the last-declared bar on top, and the total belongs
                  above its розділ. In single mode only this blue bar shows. */}
                <Bar
                  dataKey="value"
                  fill="var(--color-value)"
                  radius={[0, 3, 3, 0]}
                  maxBarSize={showPair ? 11 : 22}
                >
                  <LabelList
                    dataKey="value"
                    position="right"
                    offset={6}
                    className="fill-muted-foreground"
                    fontSize={showPair ? 10 : 11}
                    formatter={(value) => compact.format(Number(value ?? 0))}
                  />
                </Bar>
                {showPair && (
                  <Bar
                    dataKey="total"
                    fill="var(--color-total)"
                    radius={[0, 3, 3, 0]}
                    maxBarSize={11}
                  >
                    <LabelList
                      dataKey="total"
                      position="right"
                      offset={6}
                      className="fill-muted-foreground"
                      fontSize={10}
                      formatter={(value) => compact.format(Number(value ?? 0))}
                    />
                  </Bar>
                )}
              </BarChart>
            </ChartContainer>
          )}
        </div>
      </div>
    </section>
  );
}

function LabeledSelect({
  id,
  label,
  value,
  onValueChange,
  wrapperClassName,
  children,
}: {
  id: string;
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  wrapperClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('space-y-1', wrapperClassName)}>
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>{children}</SelectContent>
      </Select>
    </div>
  );
}
