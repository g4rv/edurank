import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: {
    ratingTemplate: { findMany: vi.fn() },
    ratingEntry: { findMany: vi.fn() },
  },
}));

import { db } from '@/lib/db';
import { ratingYearFor } from './rating-year';

const templates = db.ratingTemplate.findMany as unknown as Mock;
const scored = db.ratingEntry.findMany as unknown as Mock;

/**
 * Template years that exist.
 *
 * The mock applies the `where` and `orderBy` the caller passes rather than
 * returning the list whole — otherwise «never looks forward» would pass on a
 * version that had dropped the `lt` filter, since the filtering is the only
 * thing keeping next year out.
 */
const existing = (...years: number[]) =>
  templates.mockImplementation(async ({ where, orderBy }) => {
    const lt = where?.year?.lt ?? Infinity;
    const kept = years.filter((y) => y < lt);
    kept.sort((a, b) => (orderBy?.year === 'asc' ? a - b : b - a));
    return kept.map((year) => ({ year }));
  });

/** Years that have at least one RatingEntry, filtered the same way */
const withScores = (...years: number[]) =>
  scored.mockImplementation(async ({ where }) => {
    const only: number[] | undefined = where?.year?.in;
    return years.filter((y) => !only || only.includes(y)).map((year) => ({ year }));
  });

beforeEach(() => vi.clearAllMocks());

describe('ratingYearFor', () => {
  // The ставки are handed out for one year and reward the work of the year
  // before it. Ranking 2026 on 2026 rewards work nobody has finished.
  it('ranks a year on the one before it', async () => {
    existing(2024, 2025);
    withScores(2024, 2025);
    expect(await ratingYearFor(2026)).toBe(2025);
  });

  it('falls back to the ставка year when nothing came before it', async () => {
    existing();
    withScores();
    expect(await ratingYearFor(2026)).toBe(2026);
  });

  // The case this rule exists for. A template can be created months before
  // anything is scored against it — an imported year is exactly that for a
  // while — and ranking on it hands every person a rating of zero, which
  // flattens the кафедра into equal shares and looks like a working screen.
  it('skips a year that exists but has no ratings in it', async () => {
    existing(2024, 2025);
    withScores(2024);
    expect(await ratingYearFor(2026)).toBe(2024);
  });

  it('falls back to the ставка year when no earlier year has any ratings', async () => {
    existing(2024, 2025);
    withScores();
    expect(await ratingYearFor(2026)).toBe(2026);
  });

  it('takes the NEWEST scored year, not merely a scored one', async () => {
    existing(2022, 2023, 2024, 2025);
    withScores(2022, 2023, 2025);
    expect(await ratingYearFor(2026)).toBe(2025);
  });

  // A year later than the ставка year is next year's problem, not a candidate
  it('never looks forward', async () => {
    existing(2025, 2027);
    withScores(2025, 2027);
    expect(await ratingYearFor(2026)).toBe(2025);
  });

  it('only asks about years that actually have a template', async () => {
    existing(2025);
    withScores(2025);
    await ratingYearFor(2026);
    expect(templates.mock.calls[0][0].where).toEqual({ year: { lt: 2026 } });
    expect(scored.mock.calls[0][0].where).toEqual({ year: { in: [2025] } });
  });
});
