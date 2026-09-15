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
 * What a `dateRange` may span — roughly a decade back, two ahead of that.
 *
 * **Not `MIN_EVIDENCE_YEAR`** (owner, 2026-09-14). 1950 is a floor for a
 * PUBLICATION year, where an old citation is ordinary. A period is not that:
 * п.11 records consulting «на підставі договору із закладом вищої освіти», and
 * the university did not exist to sign one. Offering 1950 in the picker invited
 * a date nobody could hold a contract for.
 *
 * Forward, because an end can be ahead of today — an appointment somebody still
 * holds, a contract with a term left to run.
 */
export const RANGE_MIN_YEAR = new Date().getFullYear() - 10;
export const RANGE_MAX_YEAR = new Date().getFullYear() + 20;

/**
 * One field's rule. Exported for the Характеристика's hand-typed forms, which
 * compose a FLAT schema — `{ рік, варіант, ...поля }` — because the shared
 * renderer registers a field under its own name and nesting the evidence would
 * make every `register('bibliography')` a `register('evidence.bibliography')`.
 */
export function fieldSchema(f: EvidenceField): z.ZodType {
  switch (f.kind) {
    case 'text': {
      let base = z
        .string({ error: "Обов'язкове поле" })
        .trim()
        .max(2000, { error: 'Занадто довге значення' });
      if (f.rule === 'cyrillicName') {
        // Ukrainian letters, plus the apostrophe and hyphen its orthography
        // needs — «Дем'янчук», «Кос-Анатольський». Both apostrophe shapes,
        // because a keyboard produces one and Word the other. Latin letters are
        // refused deliberately: a transcription in this document is a claim
        // nobody made.
        base = base
          .min(2, { error: 'Щонайменше дві літери' })
          .regex(/^[А-ЩЬЮЯЄІЇҐа-щьюяєіїґ'’\-]+$/u, {
            error: 'Лише українські літери, апостроф і дефіс',
          });
      }
      return f.optional
        ? z.preprocess(emptyToUndefined, base.min(1).optional())
        : base.min(1, { error: "Обов'язкове поле" });
    }
    case 'number': {
      const min = f.min ?? 0;
      let base = z.coerce
        .number({ error: 'Має бути числом' })
        .min(min, { error: `Мінімальне значення — ${min}` });
      // A ceiling only where the spec sets one. Most numbers here are counts —
      // сторінки, співавтори, дні — and inventing a maximum for those would
      // refuse real work. A YEAR is the case that needs it: «Рік початку» had a
      // floor of 1950 and nothing above, so 123123 was a valid year of
      // employment and printed into the licence document as one.
      if (f.max !== undefined) {
        base = base.max(f.max, { error: `Максимальне значення — ${f.max}` });
      }
      if (f.int) base = base.int({ error: 'Має бути цілим числом' });
      return f.optional ? z.preprocess(emptyToUndefined, base.optional()) : base;
    }
    case 'url': {
      // Bare hosts get https:// so a pasted `www.scopus.com/…` is not rejected
      // as "not a URL" when it plainly is one
      let base: z.ZodType<string> = z
        .string({ error: "Обов'язкове поле" })
        .trim()
        // Before the format check, not after. `withProtocol('')` is `''`, which
        // `z.url()` rejects as «Некоректне посилання» — telling somebody who
        // typed nothing that what they typed is malformed, and sending them
        // hunting for a typo in an empty box.
        .min(1, { error: "Обов'язкове поле" })
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
    case 'dateRange': {
      // Both ends, and the end never before the start. The picker cannot
      // produce an inverted range, so this is here for the request that skips
      // the picker — the half of a shared rule an attacker keeps.
      const day = z.iso.date({ error: 'Некоректна дата' }).refine(
        (v) => {
          const year = Number(v.slice(0, 4));
          return year >= RANGE_MIN_YEAR && year <= RANGE_MAX_YEAR;
        },
        { error: `Рік має бути в межах ${RANGE_MIN_YEAR}–${RANGE_MAX_YEAR}` }
      );
      const base = z
        .object({ from: day, to: day })
        .refine((r) => r.from <= r.to, { error: 'Дата завершення раніше за дату початку' });
      // An untouched range arrives as '' from the form, like every other kind.
      const blank = (v: unknown) =>
        v === '' || v === null || (typeof v === 'object' && v !== null && !('from' in v))
          ? undefined
          : v;
      return f.optional ? z.preprocess(blank, base.optional()) : base;
    }
    case 'isbn': {
      // Stored as typed — publishers hyphenate differently, and the check
      // ignores separators anyway
      const base = z
        .string({ error: "Обов'язкове поле" })
        .trim()
        // See the url case: an empty box is not a failed check digit.
        .min(1, { error: "Обов'язкове поле" })
        .refine(isValidIsbn, { error: 'Некоректний ISBN — перевірте контрольну цифру' });
      return f.optional ? z.preprocess(emptyToUndefined, base.optional()) : base;
    }
    case 'doi': {
      // Stored bare (resolver prefix stripped) so the checker can query it directly
      const base = z
        .string({ error: "Обов'язкове поле" })
        .trim()
        // See the url case. `normalizeDoi` trims on its own, so the `trim()`
        // here changes no stored value — it only lets `min` see a box holding
        // nothing but spaces for what it is.
        .min(1, { error: "Обов'язкове поле" })
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
      const base = z.enum(values, { error: 'Оберіть значення зі списку' });
      // An optional list is a real case, not a contradiction: п.15's «Призове
      // місце» has four answers for the two winner variants and none for the
      // two jury ones. Blank arrives as '' from an untouched Radix select, so
      // it goes through the same `emptyToUndefined` every other kind uses.
      return f.optional ? z.preprocess(emptyToUndefined, base.optional()) : base;
    }
  }
}

/** Zod schema for an arbitrary subset of evidence fields (e.g. the shared
 *  fields of an entity-first group entry, validated apart from the role).
 *  Pass `scoring` to also apply the rule-level checks — without it only the
 *  per-field ones run, which is what a partial subset wants.
 *
 *  `allowUnknownKeys` (default off — every other caller wants a typo in
 *  evidence to fail loudly) lets a payload carry MORE than this subset
 *  without failing. The science plan needs exactly that: a row saved before
 *  D23 still holds a `title` in `details` alongside the planning fields, and
 *  removing a requirement must not turn into rejecting the rows that used to
 *  satisfy it. Unknown keys are silently dropped from `parsed.data`, not kept —
 *  a plan row writes back only what it actually validated. */
export function schemaForFields(
  fields: readonly EvidenceField[],
  scoring?: ScoringSpec,
  opts?: { allowUnknownKeys?: boolean }
): z.ZodType<Record<string, unknown>> {
  const shape = Object.fromEntries(fields.map((f) => [f.name, fieldSchema(f)]));
  const object = opts?.allowUnknownKeys ? z.object(shape) : z.strictObject(shape);

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
