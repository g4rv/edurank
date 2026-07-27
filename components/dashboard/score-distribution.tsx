'use client';

import { Area, AreaChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import type { ScoreBand } from '@/lib/queries/get-dashboard';

// The shape of the year: where the crowd sits and how far the top runs ahead of
// it. Score is a continuum (0 → 8k), so it reads as a smooth filled curve with a
// dot per band — not bars. One series, one accent colour; the card title says
// what is plotted. With no bars there is nothing to hide the line behind.
const config = {
  count: { label: 'НПП', color: 'var(--chart-accent)' },
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
    <ChartContainer config={config} className="aspect-auto h-64 w-full">
      {/* Top margin is the median label's room. */}
      <AreaChart data={data} margin={{ top: 20, right: 12, bottom: 0, left: 8 }}>
        <defs>
          <linearGradient id="distributionFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-count)" stopOpacity={0.35} />
            <stop offset="95%" stopColor="var(--color-count)" stopOpacity={0.04} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          interval="preserveStartEnd"
          className="text-xs"
        />
        {/* Without an axis the count per band would live only in the tooltip,
            and a value a mouse can reach is not a value everyone can read. */}
        <YAxis
          tickLine={false}
          axisLine={false}
          width={28}
          allowDecimals={false}
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
            strokeDasharray="4 3"
            label={{
              value: `медіана ${full.format(Math.round(median))}`,
              position: 'top',
              fill: 'var(--muted-foreground)',
              fontSize: 11,
            }}
          />
        )}
        <Area
          type="monotone"
          dataKey="count"
          stroke="var(--color-count)"
          strokeWidth={2.5}
          fill="url(#distributionFill)"
          dot={{ r: 3, fill: 'var(--color-count)', stroke: 'var(--background)', strokeWidth: 1.5 }}
          activeDot={{
            r: 5,
            fill: 'var(--color-count)',
            stroke: 'var(--background)',
            strokeWidth: 2,
          }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ChartContainer>
  );
}
