// The first term of the ставка formula — a кафедра's pool spread by rating.
//
// This follows the university's OWN working sheet (the Apps Script behind
// «Облік ставок кафедри», edu-reference/rating_spread_example.txt), not the
// положення's printed formula. Two passes:
//
//                    ⎛      Rᵢ    Кст ⎞
//   prelimᵢ = clamp  ⎜ 0.5 ⋅── + ─── ⎟   between 0.5 and the person's cap
//                    ⎝     <R>     n  ⎠
//
//              ⎛ prelimᵢ     Rᵢ  ⎞
//   Vcᵢ = min ⎜ ───────── + ──── ⎟ ÷ 2 ⋅ Кст ,  capped at the person's max
//              ⎝ Σprelim     ΣR  ⎠
//
// WHY THIS RATHER THAN THE ПОЛОЖЕННЯ. The положення gives each person a value
// and nothing makes those values add up to `Кст`: it is a weighting rule, not
// an allocation. Computed literally it overspends — 4.90 against a pool of
// 4.00 on Кафедра вищої математики. The second pass here is the missing step:
// both bracketed terms are SHARES that each sum to 1, so their average does
// too, and multiplying by `Кст` lands the кафедра on its pool by construction.
// Whatever is left over is ladder dust of a few hundredths, never a deficit.
//
// Verified against the university's own output for Кафедра історії — seven
// people, `Кст` 6.00 — reproducing all seven ставки and their «не розподілено»
// of 0.10 exactly. See the test.
//
// `Кнпп` does NOT appear. The sheet divides by the headcount and normalises;
// the п.38 licence count sizes nothing here. It remains what it always was — a
// figure the кафедра is judged on — and the page still shows it.
//
// Order of operations, and it matters: compute at full precision → round to
// kopecks → snap to the 0.05 ladder → cap. Rounding a share and then summing is
// what produced the old system's negative «нерозподілено».

import { MIN_STAKE, ceilToStep, snapToStep, toHundredths } from './units';
import { round2 } from '@/lib/round';

/** What the formula needs about one person */
export interface FormulaPerson {
  staffId: string;
  /** RatingEntry.totalScore for the year */
  rating: number;
  /** Their floor and ceiling in hundredths — defaults applied by the caller */
  minHundredths: number;
  maxHundredths: number;
}

export interface FormulaShare {
  staffId: string;
  rating: number;
  /** Before rounding and capping — kept so the UI can explain a clamped row */
  rawHundredths: number;
  /** What the formula proposes: rounded to the 0.05 ladder, then bounded */
  hundredths: number;
  /** Which bound bit, if either. Null means the value survived untouched. */
  clampedTo: 'min' | 'max' | null;
}

export interface FormulaResult {
  shares: FormulaShare[];
  /** <R> — the кафедра's average rating */
  averageRating: number;
  /**
   * False when the formula cannot be evaluated at all: nobody on the кафедра,
   * or every rating is zero. Everyone then lands on their floor, which is a
   * defensible answer — but the screen must say WHY rather than present a floor
   * as a calculation.
   */
  computable: boolean;
  /**
   * What the proposal adds up to, in hundredths.
   *
   * Unlike the положення's formula this lands ON the pool: the shares sum to 1
   * before being multiplied by `Кст`. It can still differ from `Кст` by a few
   * hundredths, because each person is snapped to the 0.05 ladder and because a
   * cap can hold somebody below their share. That remainder is what the head
   * hands out by hand, and it is what «не розподілено» shows.
   */
  totalHundredths: number;
}

/** The preliminary weight's own floor, from the sheet — NOT a floor on the ставка */
const PRELIM_FLOOR = 0.5;

/**
 * The pool share the formula proposes for everyone on one кафедра.
 *
 * `people` must be every НПП on the кафедра: both passes divide by counts and
 * sums over the whole кафедра, so leaving somebody out changes everyone else's
 * number.
 */
export function formulaShares({
  people,
  kstHundredths,
}: {
  people: readonly FormulaPerson[];
  kstHundredths: number;
}): FormulaResult {
  const n = people.length;
  const totalRating = people.reduce((sum, p) => sum + p.rating, 0);
  const averageRating = n > 0 ? totalRating / n : 0;
  const computable = n > 0 && totalRating > 0;

  const kst = kstHundredths / 100;

  // ── Pass 1: a preliminary weight per person ──
  // Somebody with no rating is left out of both sums entirely rather than
  // carried as a zero: they would otherwise dilute everyone else's share.
  // Note the order — the cap is applied first and the 0.5 floor second, so a
  // cap below 0.5 does not drag the WEIGHT under it. The cap still binds the
  // final ставка in pass 2, which is where it belongs.
  const prelim = people.map((p) =>
    computable && p.rating > 0
      ? Math.max(
          PRELIM_FLOOR,
          Math.min(p.maxHundredths / 100, 0.5 * (p.rating / averageRating) + kst / n)
        )
      : 0
  );
  const totalPrelim = prelim.reduce((sum, v) => sum + v, 0);

  // ── Pass 2: turn the weights into shares of the pool ──
  const shares = people.map((person, i) => {
    const scoring = computable && person.rating > 0 && totalPrelim > 0;

    // Half by adjusted weight, half by raw rating. Each bracket sums to 1
    // across the кафедра, so the total lands on `Кст`.
    const share = scoring ? (prelim[i] / totalPrelim + person.rating / totalRating) / 2 : 0;
    const rawHundredths = share * kst * 100;

    // Kopecks first, then the ladder — the sheet rounds in that order, and the
    // two-step is why an exact ladder tie can never arise.
    let hundredths = scoring ? snapToStep(toHundredths(round2(share * kst))) : 0;

    let clampedTo: 'min' | 'max' | null = null;
    if (hundredths > person.maxHundredths) {
      hundredths = person.maxHundredths;
      clampedTo = 'max';
    }

    // Ours, not the sheet's: the per-person minimum an ADMIN may set, and the
    // положення's «nobody gets zero». Skipped for a person the кафедра has
    // capped at zero, for anyone with no rating, and when there is no pool at
    // all — a floor is a share of something, and a кафедра whose `Кст` has not
    // been set yet is not handing out 0.1 to everybody on the strength of it.
    const floor = Math.max(person.minHundredths, MIN_STAKE);
    if (scoring && kstHundredths > 0 && person.maxHundredths > 0 && hundredths < floor) {
      hundredths = ceilToStep(Math.min(floor, person.maxHundredths));
      clampedTo = 'min';
    }

    return { staffId: person.staffId, rating: person.rating, rawHundredths, hundredths, clampedTo };
  });

  return {
    shares,
    averageRating,
    computable,
    totalHundredths: shares.reduce((sum, s) => sum + s.hundredths, 0),
  };
}

/**
 * The floor and ceiling to use when ADMIN has set none for this person.
 *
 * The ceiling is 1.00, which is the sheet's default — one full ставка. 1.5 is
 * not a default there but the hard ceiling on a HAND-typed value, which is a
 * different rule and belongs with the input, not here.
 */
export const DEFAULT_LIMITS = {
  minHundredths: MIN_STAKE,
  maxHundredths: toHundredths(1),
} as const;
