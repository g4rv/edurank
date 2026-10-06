import type { AdminPosition } from '@/lib/generated/prisma/client';
import { ADMIN_POSITION_LABELS } from '@/lib/labels';
import { fromHundredths } from './units';
import { round2 } from '@/lib/round';

// What an НПП's administrative position adds to what they have EARNED — never
// to what they are paid.
//
// The whole feature rests on one sentence from the owner (2026-08-17):
// «bonuses will show potential usefulness of НПП and not actual rate he has,
// the rate is decided by head». So nothing here is added to a ставка by any
// code path. `Рекомендовано` is a figure to compare against, and the завідувач
// types the number.
//
// **Automatic, because the data already exists.** `Staff.adminPositions` is on
// every profile, and a headship is on the кафедра or факультет that names the
// person (`heldAdminPositions`, 2026-10-06); asking somebody to tick
// «заступник декана» again would be asking them to restate a fact the app holds.
// ADMIN sets a value per position once a year, and it applies everywhere.
//
// **Every post is priced on its own and they add up** (owner, 2026-10-06).
// Rating 1.6 pays only the highest post; this is a different question — what
// the work is worth — and a заступник декана who also runs a лабораторія does
// both.

/** Every position, in the order the university lists them — рейтинг first */
export const POSITION_ORDER: readonly AdminPosition[] = [
  'VICE_RECTOR',
  'DEAN',
  'VICE_DEAN',
  'ACADEMIC_SECRETARY',
  'ADMISSION_SECRETARY',
  'DEPARTMENT_HEAD',
  'UNIT_HEAD',
  'DEPUTY_DEPARTMENT_HEAD',
  'DEPUTY_ADMISSION_SECRETARY',
  'LAB_HEAD',
  'CENTER_HEAD',
];

/**
 * The positions a ставка надбавка may be set for — everything except проректор
 * and декан (owner, 2026-08-24).
 *
 * Those two are paid through their own arrangements outside EduRank, so pricing
 * them here would invite somebody to pay the same надбавка twice. They keep
 * their RATING points — item 1.6 still scores проректор 100 and декан 80, which
 * is the положення and is untouched by this.
 *
 * `POSITION_ORDER` stays the full list: it is the label order for the profile
 * field and for anything that has to name a position.
 */
export const PRICED_POSITIONS: readonly AdminPosition[] = POSITION_ORDER.filter(
  (position) => position !== 'VICE_RECTOR' && position !== 'DEAN'
);

/** One line of the tooltip: every position, and whether this person holds it */
export interface StatusLine {
  position: AdminPosition;
  label: string;
  /** In ставки. Zero when ADMIN has not priced this position for the year. */
  value: number;
  /** True for every position this person actually holds */
  counts: boolean;
}

/**
 * Every position with its value, flagged for one person.
 *
 * The full list is returned rather than only what counts, because the owner
 * asked for it: «show total list of all checks but those that count with
 * checkmark». A head looking at a row should be able to see what a position
 * WOULD have been worth, not only what it was — that is the difference between
 * a number and an explanation.
 */
export function statusLines(
  held: readonly AdminPosition[],
  valuesByPosition: ReadonlyMap<AdminPosition, number>
): StatusLine[] {
  // `PRICED_POSITIONS`, not the full list: this tooltip explains a надбавка,
  // and a row for a position nobody may be paid for here is noise on the one
  // screen where the head is deciding money.
  return PRICED_POSITIONS.map((position) => ({
    position,
    label: ADMIN_POSITION_LABELS[position],
    value: fromHundredths(valuesByPosition.get(position) ?? 0),
    counts: held.includes(position),
  }));
}

/**
 * What this person's positions are worth, in ставки: each one's price, added up
 * (owner, 2026-10-06). Summed in hundredths and converted once, so two prices
 * never pick up a float's tail.
 */
export function statusValue(
  held: readonly AdminPosition[],
  valuesByPosition: ReadonlyMap<AdminPosition, number>
): number {
  let hundredths = 0;
  for (const position of new Set(held)) hundredths += valuesByPosition.get(position) ?? 0;
  return fromHundredths(hundredths);
}

/**
 * «Рекомендовано» — what the objective figures say this person has earned.
 *
 * ```
 * рекомендовано = за формулою + здобувачі + статус
 * ```
 *
 * Built on **за формулою**, not on the ставка the head has typed. A target that
 * moved every time somebody edited the field it is meant to be compared against
 * would be useless — the head would be chasing their own number.
 *
 * **Two decimals**, because it is a ставка and not a bonus. The parts that make
 * it up are finer — a заочний контрактний здобувач is worth about 0,004 — but
 * the answer goes in a field that takes 0,05 steps, so «1,047» was a number
 * nobody could enter. Summed at full precision and rounded once at the end.
 *
 * **Not capped at Макс** (decided 2026-08-17). Where somebody has earned more
 * than their ceiling allows, the screen says so and ADMIN can raise the cap;
 * quietly showing 1,00 instead of 1,047 would hide the very thing the кафедра
 * needs to argue about.
 */
export function recommendedStake({
  formulaHundredths,
  studentBonus,
  status,
}: {
  formulaHundredths: number;
  studentBonus: number;
  status: number;
}): number {
  return round2(fromHundredths(formulaHundredths) + studentBonus + status);
}
