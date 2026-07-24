'use client';

import { Area, Bar, CartesianGrid, ComposedChart, ReferenceLine, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import type { ScoreBand } from '@/lib/queries/get-dashboard';

// The shape of the year: where the crowd sits and how far the top runs ahead of
// it. Bars carry the exact per-band count; a smooth curve over them traces the
// overall shape (the "level"). One series, so no legend — the card title says
// what is plotted. Monochrome: bars are one gray, the curve is the foreground —
// it reads as shape and position, never as a second category.
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
          over whatever bar happens to stand at the median. barCategoryGap is
          tight so the bars nearly touch and the row reads as a continuum, not
          islands. */}
      <ComposedChart
        data={data}
        margin={{ top: 20, right: 8, bottom: 0, left: 8 }}
        barCategoryGap="8%"
      >
        <defs>
          {/* Faint fill under the curve — enough to read as a shape, not enough
              to compete with the bars for the same ink. */}
          <linearGradient id="distributionCurve" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--foreground)" stopOpacity={0.14} />
            <stop offset="100%" stopColor="var(--foreground)" stopOpacity={0} />
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
            label={{
              value: `медіана ${full.format(Math.round(median))}`,
              position: 'top',
              fill: 'var(--muted-foreground)',
              fontSize: 11,
            }}
          />
        )}
        <Bar dataKey="count" fill="var(--color-count)" radius={[3, 3, 0, 0]} />
        {/* The curve rides over the bars — same data, drawn as a shape. It goes
            last so the line and its fill sit on top of the bars. */}
        <Area
          type="monotone"
          dataKey="count"
          stroke="var(--foreground)"
          strokeWidth={1.5}
          fill="url(#distributionCurve)"
          dot={false}
          activeDot={false}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ChartContainer>
  );
}
