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

// The report, native and themed: the two filters drive a live Recharts bar
// chart, and «PDF» downloads exactly what the filters describe. The on-screen
// chart is the app's monochrome self (single series, one gray); the PDF keeps
// the university's house-style colours — they diverge on purpose.

const METRICS: { value: string; label: string }[] = [
  { value: 'total', label: 'Загальний бал' },
  { value: '1', label: 'Розділ 1 — професійний розвиток' },
  { value: '2', label: 'Розділ 2 — навчальна діяльність' },
  { value: '3', label: 'Розділ 3 — науково-інноваційна діяльність' },
  { value: '4', label: 'Розділ 4 — організаційна діяльність' },
  { value: '5', label: 'Розділ 5 — навчально-методичне забезпечення' },
];

const config = {
  value: { label: 'Бал', color: 'var(--chart-3)' },
} satisfies ChartConfig;

const full = new Intl.NumberFormat('uk-UA');
const compact = new Intl.NumberFormat('uk-UA', { notation: 'compact' });

interface Row {
  name: string;
  short: string;
  value: number;
  nppCount: number | null;
}

export function ReportsView({
  year,
  departments,
}: {
  year: number;
  departments: ReportDepartment[];
}) {
  // One control: «all» plots every кафедра's average, a department id plots that
  // кафедра's НПП. Either way the question is «which кафедри», so it reads as one.
  const [target, setTarget] = useState('all');
  const [metric, setMetric] = useState('total');

  const isAll = target === 'all';
  const metricIdx = metric === 'total' ? null : Number(metric) - 1;

  const data: Row[] = useMemo(() => {
    const pick = (sections: number[], total: number) =>
      metricIdx === null ? total : sections[metricIdx];

    if (isAll) {
      return departments
        .map((d) => ({
          name: d.name,
          short: d.name.replace(/^Кафедра\s+/i, ''),
          value: pick(d.avgSections, d.avgTotal),
          nppCount: d.nppCount,
        }))
        .sort((a, b) => b.value - a.value);
    }

    const dept = departments.find((d) => d.id === target);
    if (!dept) return [];
    return dept.staff
      .map((s) => ({
        name: s.name,
        short: s.name,
        value: pick(s.sections, s.total),
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
  // squeeze into a smear.
  const height = Math.max(180, data.length * 30 + 44);

  return (
    <section className="rounded-xl border bg-card">
      <div className="space-y-3 border-b px-4 py-3">
        <div className="flex items-center justify-between gap-3">
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

        <div className="flex flex-wrap items-end gap-3">
          <LabeledSelect
            id="reportTarget"
            label="Кафедра"
            value={target}
            onValueChange={setTarget}
            wrapperClassName="min-w-40 flex-1"
          >
            <SelectItem value="all">Усі кафедри</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))}
          </LabeledSelect>

          <LabeledSelect
            id="reportMetric"
            label="Показник"
            value={metric}
            onValueChange={setMetric}
            wrapperClassName="min-w-40 flex-1"
          >
            {METRICS.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </LabeledSelect>
        </div>
      </div>

      <div className="px-2 py-4 sm:px-4">
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
                      <p className="mt-1">
                        {full.format(Math.round(row.value))} балів
                        {row.nppCount !== null && ` · ${row.nppCount} НПП`}
                      </p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="value" fill="var(--color-value)" radius={[0, 4, 4, 0]} maxBarSize={22}>
                <LabelList
                  dataKey="value"
                  position="right"
                  offset={8}
                  className="fill-muted-foreground"
                  fontSize={11}
                  formatter={(value) => compact.format(Number(value ?? 0))}
                />
              </Bar>
            </BarChart>
          </ChartContainer>
        )}
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
