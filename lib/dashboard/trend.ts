import { round2 } from '@/lib/round';

/** How many years the «За роками» line shows, newest last */
export const TREND_YEARS = 10;

export interface YearPoint {
  year: number;
  /** All points of all НПП that year */
  total: number;
  median: number;
  /** НПП counted — the people behind the two figures */
  count: number;
}

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** One year's figures from each НПП's total score */
export function summarise(year: number, totals: number[]): YearPoint {
  const sorted = [...totals].sort((a, b) => a - b);
  return {
    year,
    // Rounded once at the end: a few hundred stored 2-decimal scores still drift
    total: round2(totals.reduce((acc, t) => acc + t, 0)),
    median: round2(median(sorted)),
    count: totals.length,
  };
}
