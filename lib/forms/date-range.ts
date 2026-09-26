import { differenceInCalendarDays } from 'date-fns';
import type { DateRange } from 'react-day-picker';

/** Which end of the range the next click writes. */
export type RangeEnd = 'from' | 'to';

/**
 * A range is chosen by clicks that alternate ends: **start, end, start, end.**
 * Each click writes ONE end and leaves the other where it is — 1 → 1–31 →
 * 22–31 → 22–23. Nothing is cleared on the way, so a range can be walked into
 * place instead of re-picked (owner, 2026-09-07).
 *
 * Two invariants hold on every click, and they are what the tests are really
 * about:
 *
 * 1. **The day clicked becomes an endpoint.** Always. Whatever else happens, a
 *    person sees the day they pointed at land on the edge of the band.
 * 2. **The other endpoint survives.** It is never dropped, never inherited by
 *    the day just clicked.
 *
 * Which is why an inverted write is redirected rather than sorted out
 * afterwards. Clicking 30 when the range is 1–11 and the cycle says «start»
 * cannot mean «start at 30, end at 11» — so it writes the END instead, giving
 * 1–30, and the cycle continues from there. The first attempt at this swapped
 * the pair after writing (`{from: 30, to: 11}` → `{from: 11, to: 30}`), which
 * looks equivalent and is not: it overwrote the start with the clicked day and
 * then handed the START slot to the old END. On screen one endpoint stuck fast
 * — 1–11, then 11–30, then 1–11 again, with 11 immovable.
 *
 * This replaces react-day-picker's own `addToRange`, which cannot express the
 * alternation at all. Given a finished range it moves the START only when the
 * click is strictly BEFORE it; the next branch, `isAfter(date, from)`, then
 * swallows the whole rest of the calendar and moves the END. (It leaves the
 * library's own `isAfter(date, to)` branch unreachable — the tell that this is
 * a slip rather than a decision.) A start date could be dragged earlier but
 * never later.
 *
 * **Which end is next cannot be read off the range**, which is why `setting` is
 * a parameter rather than something derived here. After the second click and
 * after the third, both ends are filled in and the two look identical — yet one
 * is followed by «set the start» and the other by «set the end». The caller
 * keeps that one bit and passes it back.
 *
 * Dates are compared in whole days, so the time on them cannot decide anything.
 */
export function stepRange(
  current: DateRange | undefined,
  clicked: Date,
  setting: RangeEnd
): { range: DateRange; next: RangeEnd } {
  const from = current?.from;
  const to = current?.to;

  // Nothing chosen: the click can only open a range, whatever the caller thinks
  // is next. This is also how the cycle recovers if something else on the page
  // cleared the range behind our back.
  if (!from) return { range: { from: clicked, to: undefined }, next: 'to' };

  // Half-open: the click closes it, and the two days sort themselves out.
  if (!to) {
    const range =
      differenceInCalendarDays(clicked, from) < 0
        ? { from: clicked, to: from }
        : { from, to: clicked };
    return { range, next: 'from' };
  }

  // Both ends present. Write the one the cycle asks for — unless that would put
  // the start after the end, in which case write the other and let the cycle
  // pick up from there.
  const writing: RangeEnd =
    setting === 'from' && differenceInCalendarDays(clicked, to) > 0
      ? 'to'
      : setting === 'to' && differenceInCalendarDays(clicked, from) < 0
        ? 'from'
        : setting;

  return {
    range: writing === 'from' ? { from: clicked, to } : { from, to: clicked },
    next: writing === 'from' ? 'to' : 'from',
  };
}
