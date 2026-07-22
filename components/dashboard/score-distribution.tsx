'use client';

import { Bar, BarChart, CartesianGrid, ReferenceLine, XAxis } from 'recharts';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import type { ScoreBand } from '@/lib/queries/get-dashboard';

// The shape of the year: where the crowd sits and how far the top runs ahead of
// it. One series, so no legend — the card title says what is plotted.
const config = {
  count: { label: 'НПП', color: 'var(--chart-3)' },
} satisfies ChartConfig;

const compact = new Intl.NumberFormat('uk-UA', { notation: 'compact' });
const full = new Intl.NumberFormat('uk-UA');

export function ScoreDistribution({ bands, median }: { bands: ScoreBand[]; median: number }) {
  const data = bands.map((band) => ({
    // The axis carries the band's floor; the tooltip spells the range out
    label: compact.format(band.from),
    range: `${full.format(band.from)}–${full.format(band.to)}`,
    count: band.count,
  }));

  return (
    // aspect-auto: ChartContainer ships aspect-video, which fights an explicit
    // height and lets the chart decide its own width
    <ChartContainer config={config} className="aspect-auto h-56 w-full">
      {/* Top margin is the median label's room — without it the label is drawn
          over whatever bar happens to stand at the median. */}
      <BarChart data={data} margin={{ top: 20, right: 8, bottom: 0, left: 8 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          interval="preserveStartEnd"
          className="text-xs"
        />
        <ChartTooltip
          cursor={false}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const row = payload[0].payload as (typeof data)[number];
            return (
              <div className="rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-md">
                <p className="font-medium">{row.range} балів</p>
                <p className="text-muted-foreground">{row.count} НПП</p>
              </div>
            );
          }}
        />
        {median > 0 && (
          <ReferenceLine
            x={compact.format(bands.find((b) => median >= b.from && median < b.to)?.from ?? 0)}
            stroke="var(--foreground)"
            strokeWidth={1}
            label={{
              value: `медіана ${full.format(Math.round(median))}`,
              position: 'top',
              fill: 'var(--muted-foreground)',
              fontSize: 11,
            }}
          />
        )}
        <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} maxBarSize={24} />
      </BarChart>
    </ChartContainer>
  );
}
