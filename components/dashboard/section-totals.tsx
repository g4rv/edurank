'use client';

import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';

// Where the university's points come from, by розділ. The розділи are numbered
// on the official form, so the number is the label the reader already knows;
// the bars share one accent colour and length does the comparing.
const config = {
  total: { label: 'Балів', color: 'var(--chart-accent)' },
} satisfies ChartConfig;

// The full titles all open with «Показники …» and run to 70 characters, which
// no axis can hold. The axis gets a short name; the tooltip gives the full one.
const SHORT_TITLES: Record<number, string> = {
  1: 'Професійний розвиток',
  2: 'Навчальна',
  3: 'Науково-інноваційна',
  4: 'Організаційна',
  5: 'Moodle',
};

const full = new Intl.NumberFormat('uk-UA');
const compact = new Intl.NumberFormat('uk-UA', { notation: 'compact' });

export function SectionTotals({
  sections,
}: {
  sections: { section: number; title: string; total: number }[];
}) {
  const data = sections.map((s) => ({ ...s, axis: `${s.section}. ${SHORT_TITLES[s.section]}` }));

  return (
    <ChartContainer config={config} className="aspect-auto h-56 w-full">
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 44, bottom: 4, left: 0 }}>
        <CartesianGrid horizontal={false} stroke="var(--border)" />
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="axis"
          tickLine={false}
          axisLine={false}
          width={148}
          className="text-xs"
        />
        <ChartTooltip
          cursor={false}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const row = payload[0].payload as (typeof data)[number];
            return (
              <div className="max-w-64 rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-md">
                <p className="font-medium">
                  {row.section}. {row.title}
                </p>
                <p className="mt-0.5 text-muted-foreground">
                  {full.format(Math.round(row.total))} балів
                </p>
              </div>
            );
          }}
        />
        <Bar dataKey="total" fill="var(--color-total)" radius={[0, 4, 4, 0]} maxBarSize={24}>
          {/* Five bars is few enough that every tip can carry its value without
              the chart turning into a wall of numbers. */}
          <LabelList
            dataKey="total"
            position="right"
            offset={8}
            className="fill-muted-foreground"
            fontSize={11}
            formatter={(value) => compact.format(Math.round(Number(value ?? 0)))}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
