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
// **Automatic, because the data already exists.** `Staff.adminPosition` is on
// every profile and already drives the Характеристика; asking somebody to tick
// «заступник декана» again would be asking them to restate a fact the app holds.
// ADMIN sets a value per position once a year, and it applies everywhere.

/** The seven positions, in the order the university lists them — рейтинг first */
export const POSITION_ORDER: readonly AdminPosition[] = [
  'VICE_RECTOR',
  'DEAN',
  'VICE_DEAN_OR_SECRETARY',
  'DEPARTMENT_OR_UNIT_HEAD',
  'DEPUTY_DEPARTMENT_HEAD',
  'DEPUTY_ADMISSION_SECRETARY',
  'LAB_OR_CENTER_HEAD',
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
  /** True for the position this person actually holds */
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
  held: AdminPosition | null | undefined,
  valuesByPosition: ReadonlyMap<AdminPosition, number>
): StatusLine[] {
  // `PRICED_POSITIONS`, not the full list: this tooltip explains a надбавка,
  // and a row for a position nobody may be paid for here is noise on the one
  // screen where the head is deciding money.
  return PRICED_POSITIONS.map((position) => ({
    position,
    label: ADMIN_POSITION_LABELS[position],
    value: fromHundredths(valuesByPosition.get(position) ?? 0),
    counts: held === position,
  }));
}

/**
 * What this person's position is worth, in ставки.
 *
 * `Staff.adminPosition` holds ONE position, so this is a lookup rather than a
 * sum. It stays a function because the column may well become several positions
 * later — somebody is both заступник декана and завідувач лабораторії more often
 * than the enum admits — and every caller already treats it as a total.
 */
export function statusValue(
  held: AdminPosition | null | undefined,
  valuesByPosition: ReadonlyMap<AdminPosition, number>
): number {
  if (!held) return 0;
  return fromHundredths(valuesByPosition.get(held) ?? 0);
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
