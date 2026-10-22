'use client';

import { Area, AreaChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import type { ScoreBand } from '@/lib/queries/get-dashboard';

// The shape of the year: where the crowd sits and how far the top runs ahead of
// it. Score is a continuum (0 → 8k), so it reads as a smooth filled curve with a
// dot per band — not bars. One series, one accent colour; the card title says
// what is plotted. The median is a dashed rule, named in the caption under it: a
// label on the chart ran into the axis, because the median sits in the first band.
const config = {
  count: { label: 'НПП', color: 'var(--chart-accent)' },
} satisfies ChartConfig;

const compact = new Intl.NumberFormat('uk-UA', { notation: 'compact' });
const full = new Intl.NumberFormat('uk-UA');

export function ScoreDistribution({ bands, median }: { bands: ScoreBand[]; median: number }) {
  const medianBand = bands.findIndex((b) => median >= b.from && median < b.to);

  const data = bands.map((band) => ({
    // The axis carries the band's floor; the tooltip spells the range out
    label: compact.format(band.from),
    range: `${full.format(band.from)}–${full.format(band.to)}`,
    count: band.count,
  }));

  return (
    <div>
      <ChartContainer config={config} className="aspect-auto h-80 w-full">
        {/* Top margin is the median label's room. */}
        <AreaChart data={data} margin={{ top: 12, right: 16, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id="distributionFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-count)" stopOpacity={0.5} />
              <stop offset="100%" stopColor="var(--color-count)" stopOpacity={0.04} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={10}
            interval="preserveStartEnd"
            className="text-xs"
          />
          {/* Without an axis the count per band would live only in the tooltip,
            and a value a mouse can reach is not a value everyone can read. */}
          <YAxis
            tickLine={false}
            axisLine={false}
            width={32}
            allowDecimals={false}
            className="text-xs"
          />
          <ChartTooltip
            cursor={{ stroke: 'var(--brand)', strokeOpacity: 0.3 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as (typeof data)[number];
              return (
                <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-md">
                  <p className="font-medium">{row.range} балів</p>
                  <p className="text-muted-foreground">{row.count} НПП</p>
                </div>
              );
            }}
          />
          {medianBand >= 0 && (
            <ReferenceLine
              x={data[medianBand].label}
              stroke="var(--foreground)"
              strokeOpacity={0.5}
              strokeWidth={1.5}
              strokeDasharray="4 4"
            />
          )}
          <Area
            type="monotone"
            dataKey="count"
            stroke="var(--color-count)"
            strokeWidth={3}
            fill="url(#distributionFill)"
            dot={{ r: 4, fill: 'var(--color-count)', stroke: 'var(--card)', strokeWidth: 2 }}
            activeDot={{ r: 6, fill: 'var(--color-count)', stroke: 'var(--card)', strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ChartContainer>
      {median > 0 && (
        <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="h-3 border-l-2 border-dashed border-foreground/50" />
          Медіана: {full.format(Math.round(median))} балів
        </p>
      )}
    </div>
  );
}
