'use client';

import { Bar, BarChart, CartesianGrid, LabelList, ReferenceLine, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import type { DepartmentScore } from '@/lib/queries/get-dashboard';

// Average per НПП, not the department total — otherwise a big department wins
// by being big and the chart says nothing about how it is doing.
const config = {
  average: { label: 'Середній бал', color: 'var(--chart-3)' },
} satisfies ChartConfig;

const full = new Intl.NumberFormat('uk-UA');
const compact = new Intl.NumberFormat('uk-UA', { notation: 'compact' });

export function DepartmentScores({
  departments,
  universityAverage,
}: {
  departments: DepartmentScore[];
  universityAverage: number;
}) {
  const data = departments.map((d) => ({
    ...d,
    // Кафедри мають довгі назви — вісь показує коротку, підказка повну
    short: d.name.replace(/^Кафедра\s+/i, ''),
    average: Math.round(d.average),
  }));

  // Grow with the rows instead of a fixed height: a fixed box leaves one
  // department floating in white space and squeezes twenty into a smear.
  const height = Math.max(160, data.length * 34 + 32);

  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
      <BarChart data={data} layout="vertical" margin={{ top: 20, right: 44, bottom: 4, left: 0 }}>
        <CartesianGrid horizontal={false} stroke="var(--border)" />
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="short"
          tickLine={false}
          axisLine={false}
          width={128}
          className="text-xs"
        />
        <ChartTooltip
          cursor={false}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const row = payload[0].payload as (typeof data)[number];
            return (
              <div className="max-w-64 rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-md">
                <p className="font-medium">{row.name}</p>
                <p className="text-muted-foreground">{row.faculty}</p>
                <p className="mt-1">
                  {full.format(row.average)} балів у середньому · {row.nppCount} НПП
                </p>
              </div>
            );
          }}
        />
        {/* A reference line needs something to reference: with one or two
            departments it just restates the bar. */}
        {universityAverage > 0 && data.length >= 3 && (
          <ReferenceLine
            x={Math.round(universityAverage)}
            stroke="var(--foreground)"
            strokeWidth={1}
            label={{
              value: 'середнє по університету',
              position: 'top',
              fill: 'var(--muted-foreground)',
              fontSize: 11,
            }}
          />
        )}
        <Bar dataKey="average" fill="var(--color-average)" radius={[0, 4, 4, 0]} maxBarSize={24}>
          <LabelList
            dataKey="average"
            position="right"
            offset={8}
            className="fill-muted-foreground"
            fontSize={11}
            formatter={(value) => compact.format(Number(value ?? 0))}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
