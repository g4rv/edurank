import { z } from 'zod';
import { LICENCE_POSITIONS } from '@/lib/kharakterystyka/positions';
import { positionEvidenceFields } from '@/lib/kharakterystyka/position-evidence';
import { fieldSchema } from '@/validations/activity-evidence';

const POSITION_NUMBERS = LICENCE_POSITIONS.map((p) => p.number);

/**
 * A row of evidence typed by hand for one п.38 position.
 *
 * One row is one item. A position asking for five wants five rows, because a
 * single row claiming to be five is a number nobody can check against anything
 * — there is one реєстраційний номер to read, not five (owner, 2026-09-01).
 *
 * The evidence is NOT free text. Each position carries its own field spec (see
 * `lib/kharakterystyka/position-evidence.ts`), the same kind an indicator does,
 * and the printed «Дані підтвердження показника» is generated from it by
 * `summarizeEvidence` — so every row of one position reads the same way. The
 * fields are validated against the spec in `addKharakterystykaEntry`, which is
 * the only place that knows which position is being written.
 *
 * The window check is NOT here either: it needs the active rating year, which
 * is a database read, and a Zod schema that hits the database cannot be shared
 * with the form.
 */
export const kharakterystykaEntrySchema = z.object({
  staffId: z.string().min(1),

  position: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
    z
      .number({ error: 'Оберіть позицію' })
      .int()
      .refine((n) => POSITION_NUMBERS.includes(n), { error: 'Такої позиції немає' })
  ),

  year: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
    z.number({ error: 'Вкажіть рік' }).int().min(2000).max(2100)
  ),

  /**
   * Which alternative of the position this row satisfies — п.2 alone has more
   * than one, and its three bars are one патент на винахід, five деклараційних,
   * or five свідоцтв. Null means «the position's first», which is what the
   * nineteen single-alternative positions store.
   *
   * That the name is one of THIS position's alternatives is checked in the
   * action, beside the other cross-field rules: a Zod refinement here would have
   * to reach across two fields for a message about only one of them.
   */
  group: z.preprocess(
    (v) => (v === '' || v === undefined ? null : v),
    z.string().trim().min(1).max(64).nullable()
  ),

  /** Judged against the position's own field spec, in the action */
  evidence: z.record(z.string(), z.unknown()),
});

export type KharakterystykaEntrySchema = z.infer<typeof kharakterystykaEntrySchema>;

/**
 * Names the form owns, so a position's field spec can never take one of them.
 * Both are real inputs on the same flat form, and a field called `year` would
 * quietly overwrite the row's own — the one that decides whether it falls in
 * the five-year window at all. `positionEvidenceProblems` refuses it, and a
 * test holds every position to that.
 */
export const RESERVED_FORM_NAMES = ['staffId', 'position', 'year', 'group'] as const;

/**
 * The dialog's whole form: the row's own year and variant, plus the position's
 * evidence fields, all flat.
 *
 * Flat rather than `{ year, evidence: {...} }` because the shared renderer
 * registers each field under its own name — nesting would need a prefix
 * threaded through a component the rating also uses.
 */
export function positionFormSchema(position: number, minYear: number, maxYear: number) {
  const fields = positionEvidenceFields(position);
  const evidence = Object.fromEntries(fields.map((f) => [f.name, fieldSchema(f)]));

  return z.strictObject({
    year: z.preprocess(
      (v) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
      z
        .number({ error: 'Вкажіть рік' })
        .int()
        .min(minYear, { error: `Рік має бути в межах ${minYear}–${maxYear}` })
        .max(maxYear, { error: `Рік має бути в межах ${minYear}–${maxYear}` })
    ),
    group: z.string().nullable().optional(),
    ...evidence,
  });
}

/**
 * Problems with a position's field spec, in Ukrainian. Empty = valid.
 *
 * Mirrors `specProblems` in activity-type-spec.ts, which does the same job for
 * an indicator's fields. These specs are code rather than a column — the law's
 * twenty positions do not change between template years, unlike the catalogue —
 * so this guards a test rather than an admin screen.
 */
export function positionEvidenceProblems(position: number): string[] {
  const fields = positionEvidenceFields(position);
  const problems: string[] = [];

  const names = fields.map((f) => f.name);
  const dupes = names.filter((n, i) => names.indexOf(n) !== i);
  if (dupes.length > 0) {
    problems.push(`Позиція ${position}: службові назви полів повторюються — ${dupes.join(', ')}`);
  }

  for (const reserved of RESERVED_FORM_NAMES) {
    if (names.includes(reserved)) {
      problems.push(`Позиція ${position}: поле «${reserved}» конфліктує з полем форми`);
    }
  }

  return problems;
}
