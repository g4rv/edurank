import { z } from 'zod';
import { MIN_STAKE, ceilToStep, floorToStep, parseStake, snapToStep } from '@/lib/stake/units';

// Everything a person types into the ставка settings.
//
// Values arrive as strings from the form and leave as INTEGER HUNDREDTHS —
// the conversion happens here, once, so no action ever handles a float ставка.

/** «1,35» or «1.35» → 135. The message names the format rather than the rule. */
const stakeField = (label: string) =>
  z.string().transform((value, ctx) => {
    const hundredths = parseStake(value);
    if (hundredths === null) {
      ctx.addIssue({ code: 'custom', message: `${label}: вкажіть число, напр. 1,35` });
      return z.NEVER;
    }
    return hundredths;
  });

/**
 * `Кст` — a кафедра's pool for the year.
 *
 * The `≥ 0.1 × headcount` rule is NOT here: it needs the roster count, which is
 * a database read. The action applies it and says what the minimum is and why,
 * because «мінімум 1,80» without «18 осіб × 0,1» tells somebody a number without
 * telling them whether to raise the pool or check the roster.
 */
export const departmentStakeSchema = z.object({
  departmentId: z.string().min(1),
  year: z.number().int(),
  kstHundredths: stakeField('Кст'),
});
export type DepartmentStakeSchema = z.infer<typeof departmentStakeSchema>;

/**
 * The bonus pool — the кафедра's second allocation, handed out by hand.
 *
 * No floor, unlike `Кст`. That rule exists because everybody must get a minimum
 * ставка from the first pool; the second one is a top-up for the people who
 * earned it, and a кафедра whose staff recruited nobody legitimately gets zero.
 *
 * Empty clears it — the проректор may take back an allocation they have not yet
 * spent, and there is no other way to say «none» once a number is typed.
 */
export const bonusPoolSchema = z.object({
  departmentId: z.string().min(1),
  year: z.number().int(),
  bonusPoolHundredths: z
    .string()
    .transform((value, ctx) => {
      if (value.trim() === '') return null;
      const hundredths = parseStake(value);
      if (hundredths === null) {
        ctx.addIssue({ code: 'custom', message: 'Бонусний пул: вкажіть число, напр. 1,00' });
        return z.NEVER;
      }
      if (hundredths < 0) {
        ctx.addIssue({ code: 'custom', message: 'Бонусний пул не може бути відʼємним' });
        return z.NEVER;
      }
      return hundredths;
    })
    .nullable(),
});
export type BonusPoolSchema = z.infer<typeof bonusPoolSchema>;

/**
 * What one administrative position is worth.
 *
 * **Snapped to the 0,05 ladder**, like every other ставка in the app (owner,
 * 2026-08-17). A надбавка is a slice of a ставка and lands in «Рекомендовано»
 * beside numbers that are all multiples of 0,05; letting it be 0,023 would put
 * a figure on screen that no field anywhere accepts. Ties go DOWN, the same
 * rule the pool share follows, so a кафедра is never rounded quietly upward.
 *
 * Capped at one ставка: these are top-ups on a rating, and a position worth more
 * than a whole ставка is a typed decimal point, not a decision.
 */
export const statusBonusSchema = z.object({
  year: z.number().int(),
  position: z.enum([
    'VICE_RECTOR',
    'DEAN',
    'VICE_DEAN_OR_SECRETARY',
    'DEPARTMENT_OR_UNIT_HEAD',
    'DEPUTY_DEPARTMENT_HEAD',
    'DEPUTY_ADMISSION_SECRETARY',
    'LAB_OR_CENTER_HEAD',
  ]),
  valueHundredths: stakeField('Значення')
    .pipe(
      z
        .number()
        .min(0, { error: 'Значення не може бути відʼємним' })
        .max(100, { error: 'Значення не може перевищувати 1,00' })
    )
    .transform(snapToStep),
});
export type StatusBonusSchema = z.infer<typeof statusBonusSchema>;

/** The норматив for one speciality — бакалавр/денна; everything else derives */
export const specialityNormSchema = z.object({
  specialityId: z.string().min(1),
  year: z.number().int(),
  base: z.coerce
    .number({ error: 'Вкажіть число' })
    .positive({ error: 'Норматив має бути більшим за нуль' })
    // A норматив of 0.5 would make one student worth two ставки; 200 would make
    // them worth nothing. Neither is a plausible typo to accept silently.
    .max(200, { error: 'Норматив завеликий' }),
});
export type SpecialityNormSchema = z.infer<typeof specialityNormSchema>;

export const stakeYearSettingsSchema = z.object({
  year: z.number().int(),
  contractCoefficient: z.coerce
    .number({ error: 'Вкажіть число' })
    .gt(0, { error: 'Коефіцієнт має бути більшим за нуль' })
    // Above 1 a контрактник would be worth more than a бюджетник, which
    // inverts what the coefficient is for.
    .max(1, { error: 'Коефіцієнт не може перевищувати 1' }),
});
export type StakeYearSettingsSchema = z.infer<typeof stakeYearSettingsSchema>;

/**
 * A person's floor and ceiling for the year. ADMIN only — a завідувач
 * distributes inside limits they cannot change.
 */
export const staffStakeLimitsSchema = z
  .object({
    staffId: z.string().min(1),
    year: z.number().int(),
    // **Both snapped to the 0,05 ladder**, and in the direction that keeps the
    // bound a bound: a Мінімум rounds UP so nobody ends below what was typed, a
    // Максимум rounds DOWN so nobody ends above it.
    //
    // Left free, they produced a row that could not be saved at all. A Максимум
    // of 0,93 is a ceiling no legal ставка can reach — every value must be a
    // multiple of 0,05 — and `formulaShares` caps the share at exactly 0,93, so
    // the формула proposed a number `saveDistribution` then refused as off the
    // ladder. Only ADMIN can edit caps, so the завідувач staring at the row
    // could not fix it either. `statusBonusSchema` already snaps for the same
    // reason: a figure no field accepts should never reach the screen.
    minHundredths: stakeField('Мінімум').transform(ceilToStep),
    maxHundredths: stakeField('Максимум').transform(floorToStep),
  })
  .refine((v) => v.minHundredths >= MIN_STAKE, {
    // The положення says «менше 0,5 → встановлюється 0,5»; the university
    // overrode that to 0.1 (2026-08-06). What survives is that nobody reaches 0.
    error: 'Мінімум не може бути меншим за 0,10 — ставку отримують усі',
    path: ['minHundredths'],
  })
  .refine((v) => v.maxHundredths >= v.minHundredths, {
    error: 'Максимум не може бути меншим за мінімум',
    path: ['maxHundredths'],
  });
export type StaffStakeLimitsSchema = z.infer<typeof staffStakeLimitsSchema>;
