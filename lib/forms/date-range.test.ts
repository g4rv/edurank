import { describe, expect, it } from 'vitest';
import type { DateRange } from 'react-day-picker';

import { stepRange, type RangeEnd } from './date-range';

const d = (day: number) => new Date(2026, 8, day);

/** Replays a run of clicks the way the calendar does, cycle bit and all. */
function click(days: number[], start?: { range: DateRange; next: RangeEnd }) {
  let range: DateRange | undefined = start?.range;
  let next: RangeEnd = start?.next ?? 'from';
  const steps = days.map((day) => {
    const step = stepRange(range, d(day), next);
    range = step.range;
    next = step.next;
    return step.range;
  });
  return { steps, range, next };
}

describe('stepRange', () => {
  it('walks the ends in turn, clearing nothing', () => {
    // The sequence the owner specified: 1 → 1–31 → 22–31 → 22–23.
    expect(click([1, 31, 22, 23]).steps).toEqual([
      { from: d(1), to: undefined },
      { from: d(1), to: d(31) },
      { from: d(22), to: d(31) },
      { from: d(22), to: d(23) },
    ]);
  });

  it('never leaves an endpoint stuck', () => {
    // The reported bug: from 1–11, clicking 30 then 1 gave 11–30 then 1–11,
    // with 11 immovable and the clicked day thrown away.
    const steps = click([30, 1, 20], {
      range: { from: d(1), to: d(11) },
      next: 'from',
    }).steps;
    expect(steps).toEqual([
      { from: d(1), to: d(30) },
      { from: d(1), to: d(30) },
      { from: d(1), to: d(20) },
    ]);
  });

  it('makes the day clicked an endpoint, always', () => {
    const cases: [DateRange, RangeEnd, number][] = [
      [{ from: d(5), to: d(20) }, 'from', 12],
      [{ from: d(5), to: d(20) }, 'from', 2],
      [{ from: d(5), to: d(20) }, 'from', 25],
      [{ from: d(5), to: d(20) }, 'to', 12],
      [{ from: d(5), to: d(20) }, 'to', 2],
      [{ from: d(5), to: d(20) }, 'to', 25],
    ];
    for (const [range, setting, day] of cases) {
      const { range: next } = stepRange(range, d(day), setting);
      expect([next.from?.getTime(), next.to?.getTime()]).toContain(d(day).getTime());
    }
  });

  it('keeps the other endpoint on every one of those', () => {
    const before: DateRange = { from: d(5), to: d(20) };
    for (const setting of ['from', 'to'] as RangeEnd[]) {
      for (const day of [12, 2, 25]) {
        const { range } = stepRange(before, d(day), setting);
        const kept = [range.from?.getTime(), range.to?.getTime()];
        expect(kept.includes(d(5).getTime()) || kept.includes(d(20).getTime())).toBe(true);
      }
    }
  });

  it('never inverts the range', () => {
    for (const setting of ['from', 'to'] as RangeEnd[]) {
      for (const day of [1, 12, 25, 30]) {
        const { range } = stepRange({ from: d(5), to: d(20) }, d(day), setting);
        expect(range.to && range.from && range.to >= range.from).toBe(true);
      }
    }
  });

  it('lets the start move FORWARD — the case react-day-picker cannot do', () => {
    expect(stepRange({ from: d(5), to: d(20) }, d(12), 'from')).toEqual({
      range: { from: d(12), to: d(20) },
      next: 'to',
    });
  });

  it('writes the end instead when a start would land past it', () => {
    expect(stepRange({ from: d(5), to: d(20) }, d(25), 'from')).toEqual({
      range: { from: d(5), to: d(25) },
      next: 'from',
    });
  });

  it('writes the start instead when an end would land before it', () => {
    expect(stepRange({ from: d(20), to: d(25) }, d(3), 'to')).toEqual({
      range: { from: d(3), to: d(25) },
      next: 'to',
    });
  });

  it('closes a half-open range in whichever order the days fell', () => {
    expect(stepRange({ from: d(20), to: undefined }, d(3), 'to')).toEqual({
      range: { from: d(3), to: d(20) },
      next: 'from',
    });
  });

  it('takes the first click as a start whatever it is told', () => {
    expect(stepRange(undefined, d(9), 'to')).toEqual({
      range: { from: d(9), to: undefined },
      next: 'to',
    });
  });

  it('compares whole days, not the time on them', () => {
    const from = new Date(2026, 8, 5, 23, 59);
    const to = new Date(2026, 8, 20, 0, 1);
    const clicked = new Date(2026, 8, 20, 23, 59);
    // Same calendar day as `to`, so this is not «past the end» — it writes the
    // start it was asked for, even though the raw timestamp is later.
    expect(stepRange({ from, to }, clicked, 'from')).toEqual({
      range: { from: clicked, to },
      next: 'to',
    });
  });
});
