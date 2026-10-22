'use client';

import { useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Line,
  XAxis,
  YAxis,
} from 'recharts';
import { SegmentedControl } from '@/components/aurora/ui/segmented-control';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import { ScoreDistribution } from '@/components/dashboard/score-distribution';
import type { ScoreBand } from '@/lib/queries/get-dashboard';
import { TREND_YEARS, type YearPoint } from '@/lib/dashboard/trend';

// One card, three questions about the same scores, a button for each:
//  · «Розподіл» — where the crowd sits this year;
//  · «За роками» — the university's total and its median, year after year;
//  · «За розділами» — which розділ of the form the points come from.
// Chrome stays neutral; the two hues are the two series of «За роками»
// (docs/aurora.md §3 — a second hue only where there are two series).

const VIEWS = [
  { value: 'bands', label: 'Розподіл' },
  { value: 'years', label: 'За роками' },
  { value: 'sections', label: 'За розділами' },
] as const;
type View = (typeof VIEWS)[number]['value'];

const full = new Intl.NumberFormat('uk-UA');
const compact = new Intl.NumberFormat('uk-UA', { notation: 'compact' });

// The full titles all open with «Показники …» and run to 70 characters, which
// no axis can hold. The axis gets a short name; the tooltip gives the full one.
const SHORT_TITLES: Record<number, string> = {
  1: 'Професійний розвиток',
  2: 'Навчальна',
  3: 'Науково-інноваційна',
  4: 'Організаційна',
  5: 'Moodle',
};

const yearsConfig = {
  total: { label: 'Сума балів усіх НПП', color: 'var(--chart-accent)' },
  median: { label: 'Медіана', color: 'var(--chart-total)' },
} satisfies ChartConfig;

const sectionsConfig = {
  total: { label: 'Балів', color: 'var(--chart-accent)' },
} satisfies ChartConfig;

export function ScoreCharts({
  year,
  bands,
  median,
  trend,
  sections,
}: {
  year: number;
  bands: ScoreBand[];
  median: number;
  trend: YearPoint[];
  sections: { section: number; title: string; total: number }[];
}) {
  const [view, setView] = useState<View>('bands');

  const hint: Record<View, string> = {
    bands: `Скільки НПП потрапило в кожен діапазон балів, ${year} рік.`,
    years: `Сума балів усіх НПП і медіана за кожен рейтинговий рік (не більше ${TREND_YEARS} останніх).`,
    sections: `Скільки балів дає кожен розділ офіційної форми, ${year} рік.`,
  };

  return (
    <section className="min-w-0 rounded-xl border bg-card shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b px-5 py-4">
        <div className="space-y-0.5">
          <h2 className="text-base font-semibold">Бали</h2>
          <p className="text-sm text-muted-foreground">{hint[view]}</p>
        </div>
        <SegmentedControl
          aria-label="Що показати на графіку"
          value={view}
          onChange={setView}
          options={VIEWS}
          className="w-auto min-w-96"
        />
      </div>

      <div className="p-5">
        {view === 'bands' &&
          (bands.length > 0 ? (
            <ScoreDistribution bands={bands} median={median} />
          ) : (
            <Empty>Балів цього року ще немає.</Empty>
          ))}
        {view === 'years' &&
          (trend.length > 0 ? (
            <YearsChart trend={trend} />
          ) : (
            <Empty>Рейтингових років ще немає.</Empty>
          ))}
        {view === 'sections' && <SectionsChart sections={sections} />}
      </div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-16 text-center text-sm text-muted-foreground">{children}</p>;
}

function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-2 text-muted-foreground">
          <span className="h-1 w-5 rounded-full" style={{ background: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

/** The tooltip card every view shares: a heading, then one dotted line per series */
function Tip({
  title,
  lines,
}: {
  title: string;
  lines: { color?: string; label: string; value: string }[];
}) {
  return (
    <div className="min-w-40 rounded-lg border bg-background px-3 py-2.5 text-xs shadow-md">
      <p className="font-semibold">{title}</p>
      <div className="mt-1.5 space-y-1">
        {lines.map((line) => (
          <p key={line.label} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              {line.color && (
                <span className="size-2 rounded-full" style={{ background: line.color }} />
              )}
              {line.label}
            </span>
            <span className="font-medium tabular-nums">{line.value}</span>
          </p>
        ))}
      </div>
    </div>
  );
}

const DOT = { r: 5, strokeWidth: 2.5, stroke: 'var(--card)' } as const;

/**
 * Two lines on two scales. The university's total runs to tens of thousands and
 * the median to a few hundred, so one axis would flatten the median onto the
 * floor — each line gets its own, coloured like the line it belongs to.
 */
function YearsChart({ trend }: { trend: YearPoint[] }) {
  const data = trend.map((p) => ({ ...p, label: String(p.year) }));

  return (
    <div>
      <Legend
        items={[
          { color: 'var(--chart-accent)', label: 'Сума балів усіх НПП (ліва шкала)' },
          { color: 'var(--chart-total)', label: 'Медіана (права шкала)' },
        ]}
      />
      <ChartContainer config={yearsConfig} className="aspect-auto h-80 w-full">
        <ComposedChart data={data} margin={{ top: 28, right: 8, bottom: 0, left: 8 }}>
          <defs>
            <linearGradient id="yearsFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-total)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--color-total)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={10}
            padding={{ left: 56, right: 56 }}
            className="text-xs"
          />
          <YAxis
            yAxisId="total"
            orientation="left"
            tickLine={false}
            axisLine={false}
            width={48}
            domain={[0, 'auto']}
            tickFormatter={(v: number) => compact.format(v)}
            tick={{ fill: 'var(--color-total)' }}
            className="text-xs"
          />
          <YAxis
            yAxisId="median"
            orientation="right"
            tickLine={false}
            axisLine={false}
            width={48}
            // Stretched past the data so the median runs BELOW the total and the two lines'
            // labels (total above its point, median under its own) never meet
            domain={[0, (max: number) => Math.ceil(max * 1.7)]}
            tickFormatter={(v: number) => compact.format(v)}
            tick={{ fill: 'var(--color-median)' }}
            className="text-xs"
          />
          <ChartTooltip
            cursor={{ stroke: 'var(--brand)', strokeOpacity: 0.25 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as (typeof data)[number];
              return (
                <Tip
                  title={`${row.year} рік`}
                  lines={[
                    {
                      color: 'var(--chart-accent)',
                      label: 'Сума балів',
                      value: full.format(Math.round(row.total)),
                    },
                    {
                      color: 'var(--chart-total)',
                      label: 'Медіана',
                      value: full.format(Math.round(row.median)),
                    },
                    { label: 'НПП', value: full.format(row.count) },
                  ]}
                />
              );
            }}
          />
          <Area
            yAxisId="total"
            type="monotone"
            dataKey="total"
            stroke="var(--color-total)"
            strokeWidth={3}
            fill="url(#yearsFill)"
            dot={{ ...DOT, fill: 'var(--color-total)' }}
            activeDot={{ ...DOT, r: 7, fill: 'var(--color-total)' }}
            isAnimationActive={false}
          >
            <LabelList
              dataKey="total"
              position="top"
              offset={10}
              fontSize={12}
              className="fill-foreground font-medium"
              formatter={(v) => compact.format(Number(v ?? 0))}
            />
          </Area>
          <Line
            yAxisId="median"
            type="monotone"
            dataKey="median"
            stroke="var(--color-median)"
            strokeWidth={3}
            dot={{ ...DOT, fill: 'var(--color-median)' }}
            activeDot={{ ...DOT, r: 7, fill: 'var(--color-median)' }}
            isAnimationActive={false}
          >
            <LabelList
              dataKey="median"
              position="bottom"
              offset={10}
              fontSize={12}
              className="fill-foreground font-medium"
              formatter={(v) => full.format(Math.round(Number(v ?? 0)))}
            />
          </Line>
        </ComposedChart>
      </ChartContainer>
    </div>
  );
}

/** The year's points by розділ — five categories along the axis, one line through them */
function SectionsChart({
  sections,
}: {
  sections: { section: number; title: string; total: number }[];
}) {
  const sum = sections.reduce((acc, s) => acc + s.total, 0);
  const data = sections.map((s) => ({
    ...s,
    axis: `${s.section}. ${SHORT_TITLES[s.section]}`,
    share: sum > 0 ? (s.total / sum) * 100 : 0,
  }));

  return (
    <div>
      <Legend items={[{ color: 'var(--chart-accent)', label: 'Балів за розділом, усі НПП' }]} />
      <ChartContainer config={sectionsConfig} className="aspect-auto h-80 w-full">
        <AreaChart data={data} margin={{ top: 28, right: 8, bottom: 0, left: 8 }}>
          <defs>
            <linearGradient id="sectionsFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-total)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--color-total)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4" />
          <XAxis
            dataKey="axis"
            tickLine={false}
            axisLine={false}
            tickMargin={10}
            interval={0}
            padding={{ left: 48, right: 48 }}
            className="text-xs"
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={48}
            domain={[0, 'auto']}
            tickFormatter={(v: number) => compact.format(v)}
            className="text-xs"
          />
          <ChartTooltip
            cursor={{ stroke: 'var(--brand)', strokeOpacity: 0.25 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as (typeof data)[number];
              return (
                <Tip
                  title={`${row.section}. ${row.title}`}
                  lines={[
                    {
                      color: 'var(--chart-accent)',
                      label: 'Балів',
                      value: full.format(Math.round(row.total)),
                    },
                    {
                      label: 'Частка',
                      value: row.share > 0 && row.share < 1 ? '<1%' : `${Math.round(row.share)}%`,
                    },
                  ]}
                />
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="total"
            stroke="var(--color-total)"
            strokeWidth={3}
            fill="url(#sectionsFill)"
            dot={{ ...DOT, fill: 'var(--color-total)' }}
            activeDot={{ ...DOT, r: 7, fill: 'var(--color-total)' }}
            isAnimationActive={false}
          >
            <LabelList
              dataKey="total"
              position="top"
              offset={10}
              fontSize={12}
              className="fill-foreground font-medium"
              formatter={(v) => compact.format(Math.round(Number(v ?? 0)))}
            />
          </Area>
        </AreaChart>
      </ChartContainer>
    </div>
  );
}
