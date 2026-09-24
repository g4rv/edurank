import { z } from 'zod';
import { evidenceFieldsSpecSchema, scoringSpecSchema } from '@/validations/activity-type-spec';
import type { EvidenceField } from '@/lib/rating/evidence-fields';

// Validates ADMIN input for one Додаток III row (`ScienceWorkType`).
// `evidenceFields` reuses the rating's OWN `evidenceFieldsSpecSchema` verbatim
// — the canonical, strict shape for exactly this JSON, already proven by the
// rating's admin editor. There is no science-specific field shape to invent:
// `EvidenceField` (`lib/rating/evidence-fields.ts`) is the one type both
// catalogues share, and a required field is simply one with no `optional` key
// — there is no separate `required` flag to carry.
//
// `identityFields` and the scoring↔fields CONTRACT (`specProblems`, run by the
// action before anything is written) are what actually catch a broken set;
// this layer only confirms the JSON has the shape they expect to read.

export const saveWorkTypeSchema = z.object({
  // Present only when editing — its absence is what `saveWorkType` reads to
  // decide create vs. update, exactly like the rating's create/update split.
  id: z.string().min(1).optional(),
  templateId: z.string().min(1, { error: "Обов'язкове поле" }),
  // Stable key — survives the наказ renumbering the printed «№ п/п» column.
  code: z
    .string()
    .trim()
    .min(1, { error: "Обов'язкове поле" })
    .max(64)
    .regex(/^[a-z][a-z0-9_]*$/, { error: 'Лише малі латинські літери, цифри та підкреслення' }),
  itemNumber: z.string().trim().min(1, { error: "Обов'язкове поле" }).max(10),
  // Optional: only a пункт covering several види роботи needs a heading of its
  // own, and it is the наказ's wording, never something the app invents.
  //
  // `.nullable()` on both: the dialog runs this schema in the browser, whose
  // OUTPUT (empty → null) is what reaches the action. Without it, every type
  // with no heading or short name was unsaveable.
  itemTitle: z
    .string()
    .trim()
    .max(300)
    .nullable()
    .optional()
    .transform((v) => v || null),
  shortLabel: z
    .string()
    .trim()
    .max(300)
    .nullable()
    .optional()
    .transform((v) => v || null),
  label: z.string().trim().min(1, { error: "Обов'язкове поле" }).max(500),
  // `coerce`: the dialog's number input hands React Hook Form a string.
  coefficient: z.coerce
    .number({ error: 'Має бути числом' })
    .nonnegative({ error: 'Не може бути відʼємним' }),
  unitNote: z
    .string()
    .trim()
    .max(1000)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null)),
  reportingForm: z
    .string()
    .trim()
    .max(1000)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null)),
  reuse: z.enum(['ONCE', 'YEARLY']),
  sharing: z.enum(['SHARED', 'INDIVIDUAL']),
  // Priority-ordered field NAMES — checked against `evidenceFields` by the
  // action (rule 2), not here: the schema does not know one field set from
  // another until both are parsed.
  identityFields: z.array(z.string().min(1)),
  // D47 — the link and the file, each with its own rule. The pair is
  // checked by `proofRulesProblem` in the action (both NONE is refused).
  linkRule: z.enum(['REQUIRED', 'OPTIONAL', 'NONE']),
  fileRule: z.enum(['REQUIRED', 'OPTIONAL', 'NONE']),
  // Empty string (an untouched number input) and `null` both mean «без
  // обмеження» — the same preprocessing `validations/rating-admin.ts` uses for
  // this exact column on the rating side.
  maxPerYear: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : v),
    z.coerce
      .number({ error: 'Має бути числом' })
      .int({ error: 'Має бути цілим числом' })
      .positive({ error: 'Має бути більше нуля' })
      .optional()
  ),
  scoring: scoringSpecSchema,
  evidenceFields: evidenceFieldsSpecSchema,
});

export type SaveWorkTypeInput = z.input<typeof saveWorkTypeSchema>;
export type SaveWorkTypeData = z.infer<typeof saveWorkTypeSchema>;

/**
 * What may be an identity: every ordinary field, plus every JOINED group as one
 * entry — a ПІБ in three boxes (Прізвище / Ім'я / По батькові) is one identity,
 * named by its `join`, labelled by its `joinLabel`. Its single boxes are not
 * offered: keying on a surname alone would make two Коваленки one person.
 * `workKey` reads a group name the same way. Shared by the action's check and
 * the admin picker, so the two can never disagree.
 */
export function identityCandidates(
  fields: readonly EvidenceField[]
): { name: string; label: string }[] {
  const out: { name: string; label: string }[] = [];
  const seen = new Set<string>();
  for (const f of fields) {
    if (f.kind === 'text' && f.join) {
      if (seen.has(f.join)) continue;
      seen.add(f.join);
      const titled = fields.find((o) => o.kind === 'text' && o.join === f.join && o.joinLabel);
      out.push({
        name: f.join,
        label: titled?.kind === 'text' && titled.joinLabel ? titled.joinLabel : f.join,
      });
      continue;
    }
    out.push({ name: f.name, label: f.label });
  }
  return out;
}

/** The identity check rule 2 asks for — every named field must actually exist. */
export function identityFieldProblem(
  identityFields: readonly string[],
  fields: readonly EvidenceField[]
): string | null {
  const names = new Set(identityCandidates(fields).map((c) => c.name));
  const missing = identityFields.find((name) => !names.has(name));
  return missing ? `Поле ідентичності «${missing}» відсутнє серед полів форми` : null;
}
