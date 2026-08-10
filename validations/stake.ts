import { z } from 'zod';
import { MIN_STAKE, parseStake } from '@/lib/stake/units';

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
    minHundredths: stakeField('Мінімум'),
    maxHundredths: stakeField('Максимум'),
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
