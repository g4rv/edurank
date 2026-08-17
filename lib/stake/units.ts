import { round2 } from '@/lib/round';

// Ставки are stored as INTEGER HUNDREDTHS everywhere, never as floats.
//
// This is not fastidiousness. The old system kept them as floats and produced
// negative «нерозподілено» values — a кафедра that had handed out more than its
// pool according to a subtraction, and exactly the same amount according to the
// people in it. 0.1 + 0.2 ≠ 0.3 in binary floating point, and a distribution is
// a long chain of additions and one subtraction.
//
// The rule for the whole feature: integers in the database and in every sum,
// floats only where a human reads the number.

/** 1.35 → 135. Rounds, so a float that drifted arrives clean. */
export function toHundredths(value: number): number {
  return Math.round(value * 100);
}

/** 135 → 1.35 */
export function fromHundredths(hundredths: number): number {
  return hundredths / 100;
}

/** 135 → «1,35» — Ukrainian decimal comma, always two places */
export function formatStake(hundredths: number): string {
  return fromHundredths(hundredths).toFixed(2).replace('.', ',');
}

/**
 * Parses what somebody typed into hundredths, accepting «1,35» and «1.35».
 * Returns null for anything that is not a number — the caller decides whether
 * that is an error or an empty field.
 */
export function parseStake(input: string): number | null {
  const text = input.trim().replace(',', '.');
  if (!text) return null;
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) ? toHundredths(value) : null;
}

/** The step a distributed ставка moves in: 0.05, i.e. 5 hundredths */
export const STAKE_STEP = 5;

/** Nobody's ставка may fall below 0.1 — an absolute floor, not the положення's 0.5 */
export const MIN_STAKE = 10;

/**
 * Snaps a pool share to the 0.05 ladder, **ties going down**.
 *
 * Confirmed against the 2025 file, where all 226 ставки and all 226 caps are
 * exact multiples of 0.05, and with worked examples: `0.12 → 0.10` (nearer to
 * 0.10), `0.13 → 0.15` (nearer to 0.15), and an exact half — `0.125` — to the
 * lower step.
 *
 * Ties go down because rounding a whole кафедра up is how a distribution
 * quietly overspends a pool that the head was told it fitted inside.
 *
 * **Pool share only.** The recruitment bonus is not on this ladder at all — a
 * заочний контрактний здобувач is worth about 0.004, which this would round away
 * to nothing. See `roundBonus`.
 */
export function snapToStep(hundredths: number): number {
  const steps = hundredths / STAKE_STEP;
  const floor = Math.floor(steps);
  const remainder = steps - floor;
  // Strictly greater than a half goes up; exactly a half stays down.
  return (remainder > 0.5 ? floor + 1 : floor) * STAKE_STEP;
}

/**
 * The largest ladder value at or below `hundredths`, and the smallest at or
 * above it.
 *
 * Used where a bound must not be crossed. A per-person cap is absolute — in the
 * whole 2025 distribution not one person exceeds theirs — so a share that would
 * round up past it steps down to the ladder instead of sitting on an off-ladder
 * number. In practice every recorded cap is already a multiple of 0.05 and the
 * two agree; this only decides the awkward case.
 */
export function floorToStep(hundredths: number): number {
  return Math.floor(hundredths / STAKE_STEP) * STAKE_STEP;
}

export function ceilToStep(hundredths: number): number {
  return Math.ceil(hundredths / STAKE_STEP) * STAKE_STEP;
}

/**
 * The recruitment bonus, rounded to three decimals for display and export.
 *
 * Three, not two, and not the 0.05 ladder: it is the precision the university
 * already records these at, and a заочний контрактний здобувач worth ~0.004
 * would otherwise vanish.
 *
 * Compute at full precision and call this once at the end. Summing rounded
 * per-student values is the other half of how the old «нерозподілено» went
 * negative.
 */
export function roundBonus(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** «0,004» — three decimals, Ukrainian comma, trailing zeros trimmed to at least one */
export function formatBonus(value: number): string {
  return roundBonus(value).toFixed(3).replace('.', ',');
}

/**
 * A ставка held as a plain number rather than hundredths — «Рекомендовано».
 *
 * TWO decimals, like every other ставка on screen. Three is the precision a
 * BONUS is recorded at, because a заочний контрактний здобувач is worth about
 * 0,004 and rounding him to two makes him worth nothing. A recommendation is
 * not a bonus: it is a ставка somebody may type into the field next to it, and
 * that field takes two decimals in steps of 0,05. Showing «1,047» invited a
 * number nobody can enter.
 */
export function formatStakeValue(value: number): string {
  return round2(value).toFixed(2).replace('.', ',');
}

/**
 * The smallest pool that can pay every person on the кафедра the 0.1 floor.
 *
 * A validation on the `Кст` input, not a silent correction: the message has to
 * say what the minimum is and why («N осіб × 0,1»), so whoever types it knows
 * whether to raise the pool or check the roster.
 *
 * `N` is every НПП on the кафедра — the roster count, NOT `Кнпп` (confirmed
 * 2026-08-07). The two differ and it is the wider one that applies here,
 * because the rule exists so that everybody can get a working rate.
 */
export function minimumKstHundredths(headcount: number): number {
  return headcount * MIN_STAKE;
}
