import { z } from 'zod';
import type { EvidenceField } from '@/lib/rating/evidence-fields';
import type { ScoringSpec } from '@/lib/rating/scoring';
import { isValidIsbn } from '@/lib/isbn';
import { isValidDoi, normalizeDoi } from '@/lib/doi';
import { hasDomainHost, hostMatches, withProtocol } from '@/lib/link-hosts';

// Builds one Zod schema per activity type from its evidence field specs
// (carried by the ActivityType row — see validations/activity-type-spec.ts).
// Shared client (RHF resolver) + server (submit action) — single source of truth.

const emptyToUndefined = (v: unknown) =>
  v === '' || v === null || (typeof v === 'string' && !v.trim()) ? undefined : v;

/** Earliest year accepted in evidence date fields (guards against typos like 0002 or 2131412) */
export const MIN_EVIDENCE_YEAR = 1950;

/**
 * One field's rule. Exported for the Характеристика's hand-typed forms, which
 * compose a FLAT schema — `{ рік, варіант, ...поля }` — because the shared
 * renderer registers a field under its own name and nesting the evidence would
 * make every `register('bibliography')` a `register('evidence.bibliography')`.
 */
export function fieldSchema(f: EvidenceField): z.ZodType {
  switch (f.kind) {
    case 'text': {
      const base = z
        .string({ error: "Обов'язкове поле" })
        .trim()
        .max(2000, { error: 'Занадто довге значення' });
      return f.optional
        ? z.preprocess(emptyToUndefined, base.min(1).optional())
        : base.min(1, { error: "Обов'язкове поле" });
    }
    case 'number': {
      const min = f.min ?? 0;
      let base = z.coerce
        .number({ error: 'Має бути числом' })
        .min(min, { error: `Мінімальне значення — ${min}` });
      if (f.int) base = base.int({ error: 'Має бути цілим числом' });
      return f.optional ? z.preprocess(emptyToUndefined, base.optional()) : base;
    }
    case 'url': {
      // Bare hosts get https:// so a pasted `www.scopus.com/…` is not rejected
      // as "not a URL" when it plainly is one
      let base: z.ZodType<string> = z
        .string({ error: "Обов'язкове поле" })
        .trim()
        .transform(withProtocol)
        .pipe(z.url({ error: 'Некоректне посилання' }).max(2000))
        .refine(hasDomainHost, { error: 'Некоректне посилання' });

      if (f.hosts) {
        const hosts = f.hosts;
        const message = f.hostsError ?? 'Посилання на інший сайт';
        base = base.refine((v) => hostMatches(v, hosts), { error: message });
      }
      return f.optional ? z.preprocess(emptyToUndefined, base.optional()) : base;
    }
    case 'date': {
      const maxYear = new Date().getFullYear() + 1;
      const base = z.iso.date({ error: 'Некоректна дата' }).refine(
        (v) => {
          const year = Number(v.slice(0, 4));
          return year >= MIN_EVIDENCE_YEAR && year <= maxYear;
        },
        { error: `Рік має бути в межах ${MIN_EVIDENCE_YEAR}–${maxYear}` }
      );
      return f.optional ? z.preprocess(emptyToUndefined, base.optional()) : base;
    }
    case 'isbn': {
      // Stored as typed — publishers hyphenate differently, and the check
      // ignores separators anyway
      const base = z
        .string({ error: "Обов'язкове поле" })
        .trim()
        .refine(isValidIsbn, { error: 'Некоректний ISBN — перевірте контрольну цифру' });
      return f.optional ? z.preprocess(emptyToUndefined, base.optional()) : base;
    }
    case 'doi': {
      // Stored bare (resolver prefix stripped) so the checker can query it directly
      const base = z
        .string({ error: "Обов'язкове поле" })
        .transform(normalizeDoi)
        .refine(isValidDoi, { error: 'Некоректний DOI — очікується 10.XXXX/…' });
      return f.optional ? z.preprocess(emptyToUndefined, base.optional()) : base;
    }
    case 'checkbox': {
      return f.mustBeTrue
        ? z.literal(true, { error: f.requiredError ?? 'Потрібно підтвердити' })
        : z.boolean({ error: 'Оберіть значення' }).default(false);
    }
    case 'select': {
      const values = f.options.map((o) => o.value) as [string, ...string[]];
      return z.enum(values, { error: 'Оберіть значення зі списку' });
    }
  }
}

/** Zod schema for an arbitrary subset of evidence fields (e.g. the shared
 *  fields of an entity-first group entry, validated apart from the role).
 *  Pass `scoring` to also apply the rule-level checks — without it only the
 *  per-field ones run, which is what a partial subset wants. */
export function schemaForFields(
  fields: readonly EvidenceField[],
  scoring?: ScoringSpec
): z.ZodType<Record<string, unknown>> {
  const shape = Object.fromEntries(fields.map((f) => [f.name, fieldSchema(f)]));
  const object = z.strictObject(shape);

  // CHECK_SUM with nothing ticked sums to 0. Saving that would record a claim
  // of no work at all — «Зараховано» beside a score of 0, which reads as a
  // system fault to the person and to anyone moderating later. Refuse it.
  // The message lands on the first scored box, which is where the renderer
  // looks for a grouped set's single error.
  if (scoring?.kind === 'CHECK_SUM') {
    const scored = fields.filter((f) => f.kind === 'checkbox' && f.points !== undefined);
    if (scored.length > 0) {
      return object.refine(
        (v) => scored.some((f) => (v as Record<string, unknown>)[f.name] === true),
        {
          error: 'Позначте хоча б один пункт — інакше бали не нараховуються',
          path: [scored[0].name],
        }
      ) as unknown as z.ZodType<Record<string, unknown>>;
    }
  }

  return object as unknown as z.ZodType<Record<string, unknown>>;
}
