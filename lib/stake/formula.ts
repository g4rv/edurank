// The first term of the ставка formula — a кафедра's pool spread by rating.
//
//                Rнпп      Кст
//   term 1 = 0.5 ⋅ ──── ⋅ ─────
//                 <Rк>     Кнпп
//
// Pure, no DB. The SECOND term — the recruitment bonus — is not here and must
// never be folded in: `Кст` bounds this term only, the bonus is paid on top of
// it, and merging the two makes the pool ceiling impossible to enforce.
//
// Order of operations, and it matters: compute at full precision → clamp to the
// person's own limits → snap to the 0.05 ladder → make sure rounding did not
// push anybody under their floor. Rounding a share and then summing is what
// produced the old system's negative «нерозподілено».

import { MIN_STAKE, ceilToStep, floorToStep, snapToStep, toHundredths } from './units';

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
  /** Before clamping and rounding — kept so the UI can explain a clamped row */
  rawHundredths: number;
  /** What the formula proposes: clamped, then snapped to the 0.05 ladder */
  hundredths: number;
  /** Which bound bit, if either. Null means the raw value survived untouched. */
  clampedTo: 'min' | 'max' | null;
}

export interface FormulaResult {
  shares: FormulaShare[];
  /** <Rк> — the кафедра's average rating */
  averageRating: number;
  /**
   * False when the formula cannot be evaluated at all: `Кнпп` is zero (nobody
   * on the кафедра meets four of the twenty licence positions) or every rating
   * is zero. Everyone then lands on their floor, which is a defensible answer —
   * but the screen must say WHY rather than present a floor as a calculation.
   */
  computable: boolean;
  /**
   * What the formula's own proposal adds up to, in hundredths.
   *
   * **This does not generally equal `Кст`**, and that is a property of the
   * formula rather than a bug here. Σ(Rнпп/<Rк>) is exactly the headcount, so
   * the untouched total comes to `0.5 × N / Кнпп × Кст` — under the pool when
   * `Кнпп > N/2`, over it when `Кнпп < N/2`. The head closes the gap by hand,
   * which is what додаток 2's «Обґрунтування» column is for.
   */
  totalHundredths: number;
}

/**
 * The pool share the formula proposes for everyone on one кафедра.
 *
 * `knpp` is the count meeting ≥4 of the 20 п.38 positions — a divisor, and NOT
 * the same number as the headcount. The headcount bounds the pool
 * (`Кст ≥ 0.1 × N`); this scales each person's slice of it.
 */
export function formulaShares({
  people,
  kstHundredths,
  knpp,
}: {
  people: readonly FormulaPerson[];
  kstHundredths: number;
  knpp: number;
}): FormulaResult {
  const totalRating = people.reduce((sum, p) => sum + p.rating, 0);
  const averageRating = people.length > 0 ? totalRating / people.length : 0;
  const computable = people.length > 0 && knpp > 0 && averageRating > 0;

  const shares = people.map((person) => {
    // Raw value in hundredths, at full precision — no rounding until the end.
    const rawHundredths = computable
      ? 0.5 * (person.rating / averageRating) * (kstHundredths / knpp)
      : 0;

    // The absolute floor of 0.1 outranks a per-person minimum below it, and
    // `max >= min` is a validation on the caps — but a hand-inserted row could
    // still break it, so the bounds are made coherent before anything is
    // clamped into them.
    const lower = Math.max(person.minHundredths, MIN_STAKE);
    const upper = Math.max(person.maxHundredths, lower);

    // Clamp before rounding: the caps are the university's decision and the
    // ladder is presentation, so a rounding step must never cross one.
    let clampedTo: 'min' | 'max' | null = null;
    let value = rawHundredths;
    if (value < lower) {
      value = lower;
      clampedTo = 'min';
    } else if (value > upper) {
      value = upper;
      clampedTo = 'max';
    }

    // Snap once, at the end — never per-step. A cap that is itself off the
    // ladder (0.72) sends the share DOWN to the ladder rather than leaving it
    // on an off-ladder number: in the whole 2025 distribution nobody exceeds
    // their cap, so the cap wins and the ladder bends.
    let hundredths = snapToStep(value);
    if (hundredths > upper) hundredths = floorToStep(upper);
    if (hundredths < lower) hundredths = ceilToStep(lower);
    // Pathological caps only — a floor above the ceiling. The floor wins,
    // because nobody may be paid below theirs.
    if (hundredths < MIN_STAKE) hundredths = MIN_STAKE;

    return { staffId: person.staffId, rating: person.rating, rawHundredths, hundredths, clampedTo };
  });

  return {
    shares,
    averageRating,
    computable,
    totalHundredths: shares.reduce((sum, s) => sum + s.hundredths, 0),
  };
}

/** The floor and ceiling to use when ADMIN has set none for this person */
export const DEFAULT_LIMITS = {
  minHundredths: MIN_STAKE,
  /** 1.5 — the top of the ladder every 2025 cap sits on or below */
  maxHundredths: toHundredths(1.5),
} as const;
