import { z } from 'zod';
import {
  evidenceFieldsSpecSchema,
  scoringSpecSchema,
  specProblems,
} from '@/validations/activity-type-spec';

/** The section an item number claims: «3.12» → 3 */
export function itemNumberSection(itemNumber: string): number {
  return Number(itemNumber.trim().split('.')[0]);
}

// The half of an indicator that is plain settings
const base = {
  label: z.string().trim().min(1, { error: "Обов'язкове поле" }).max(500),
  itemNumber: z
    .string()
    .trim()
    .min(1, { error: "Обов'язкове поле" })
    .max(10)
    .regex(/^\d+(\.\d+)*$/, { error: 'Формат номера — 3.12' }),
  // Which розділ the indicator sits in. Editable, so a wrong choice can be
  // corrected in place instead of by deleting and rebuilding the indicator.
  section: z.coerce.number().int().min(1).max(5),
  coefficient: z.coerce
    .number({ error: 'Має бути числом' })
    .positive({ error: 'Має бути більше нуля' }),
  coefficientNote: z
    .string()
    .trim()
    .max(1000, { error: 'Занадто довге значення' })
    .transform((v) => (v === '' ? null : v))
    .nullable(),
  maxPerYear: z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.coerce
      .number({ error: 'Має бути числом' })
      .int({ error: 'Має бути цілим числом' })
      .positive({ error: 'Має бути більше нуля' })
      .optional()
  ),
  verifyingDivisionId: z
    .string()
    .transform((v) => (v === '' ? null : v))
    .nullable(),
  isActive: z.boolean(),
  // Offers the manual «Перевірено» check on /moderation. Free for any indicator:
  // it is informational and never touches a score, so there is nothing to guard.
  requiresVerification: z.boolean(),
};

// …and the half that defines the form and the arithmetic. `specProblems` is the
// same contract check the catalogue is tested against, so a hand-built
// indicator cannot be saved in a state the scoring engine would throw on.
const specs = {
  evidenceFields: evidenceFieldsSpecSchema,
  scoring: scoringSpecSchema,
};

const withCoherentSpecs = <T extends z.ZodTypeAny>(schema: T) =>
  schema.superRefine((data, ctx) => {
    const value = data as {
      evidenceFields: unknown;
      scoring: unknown;
      itemNumber: string;
      section: number;
    };

    const problems = specProblems(value.evidenceFields as never, value.scoring as never);
    for (const problem of problems) {
      ctx.addIssue({ code: 'custom', message: problem, path: ['evidenceFields'] });
    }

    // «3.12» belongs to розділ 3 and nowhere else. Item numbers are printed on
    // the official form and drive the export ordering, so a number that
    // disagrees with its section would misfile the indicator on paper.
    if (itemNumberSection(value.itemNumber) !== value.section) {
      ctx.addIssue({
        code: 'custom',
        message: `Номер має починатися з ${value.section} — показник у розділі ${value.section}`,
        path: ['itemNumber'],
      });
    }
  });

export const updateActivityTypeSchema = withCoherentSpecs(z.object({ ...base, ...specs }));

export type UpdateActivityTypeSchema = z.infer<typeof updateActivityTypeSchema>;

export const createActivityTypeSchema = withCoherentSpecs(
  z.object({
    ...base,
    ...specs,
    // Stable key for this indicator inside the template; chosen once and never
    // changed, so renumbering a year cannot orphan the rows already submitted
    code: z
      .string()
      .trim()
      .min(1, { error: "Обов'язкове поле" })
      .max(64)
      .regex(/^[a-z][a-z0-9_]*$/, {
        error: 'Лише малі латинські літери, цифри та підкреслення',
      }),
    inputSource: z.enum(['NPP_SUBMISSION', 'DIVISION_MANAGED', 'PROFILE_DERIVED']),
  })
);

export type CreateActivityTypeSchema = z.infer<typeof createActivityTypeSchema>;
