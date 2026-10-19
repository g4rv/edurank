import { z } from 'zod';
import {
  conditionMet,
  fieldShown,
  type EvidenceField,
  type FieldCondition,
} from '@/lib/rating/evidence-fields';
import { isValidIssn, normalizeIssn } from '@/lib/issn';
import type { ScoringSpec } from '@/lib/rating/scoring';
import { isValidIsbn } from '@/lib/isbn';
import { isValidDoi, normalizeDoi } from '@/lib/doi';
import { hasDomainHost, hostMatches, withProtocol } from '@/lib/link-hosts';
import { commaToPoint, decimalText, hasTooManyDecimals } from '@/lib/decimal-input';
import { personalSheets } from '@/lib/specs/scoring';

// Builds one Zod schema per activity type from its evidence field specs
// (carried by the ActivityType row — see validations/activity-type-spec.ts).
// Shared client (RHF resolver) + server (submit action) — single source of truth.

const emptyToUndefined = (v: unknown) =>
  v === '' || v === null || (typeof v === 'string' && !v.trim()) ? undefined : v;

/** Earliest year accepted in evidence date fields (guards against typos like 0002 or 2131412) */
export const MIN_EVIDENCE_YEAR = 1950;

/**
 * What a `dateRange` may span: 1 January 1950 to the end of the year ten years
 * ahead, Kyiv time (owner, 2026-10-16). Only the Характеристика's periods use
 * it — п.11, п.19, п.20.
 *
 * Replaces «a decade back, twenty years ahead» (2026-09-14). The floor was too
 * late: п.20's «Період роботи» often began in the nineties. The end may be in
 * the future, because a fixed-term contract carries its expiry date — but not
 * twenty years of it.
 *
 * A function for the end, read when the date is judged, so a server that runs
 * across 1 січня moves with the calendar.
 */
export const RANGE_MIN_DAY = `${MIN_EVIDENCE_YEAR}-01-01`;
export function rangeMaxDay(now: Date = new Date()): string {
  return `${Number(currentYearBounds(now).max.slice(0, 4)) + 10}-12-31`;
}

/**
 * A date field's `currentYear` window: 1 January of this calendar year up to
 * today, both `YYYY-MM-DD`, read in Europe/Kyiv — at 00:30 on 1 January in
 * Kyiv it is still the old year in UTC. Calendar year, not навчальний рік
 * (owner, 2026-09-24): in 2026 a 2025 publication is refused.
 *
 * Shared by the picker (its bounds) and the schema (the refusal), so the two
 * cannot disagree.
 */
export function currentYearBounds(now: Date = new Date()): { min: string; max: string } {
  // en-CA formats as YYYY-MM-DD.
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Kyiv',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return { min: `${today.slice(0, 4)}-01-01`, max: today };
}

/**
 * One field's rule. Exported for the Характеристика's hand-typed forms, which
 * compose a FLAT schema — `{ рік, варіант, ...поля }` — because the shared
 * renderer registers a field under its own name and nesting the evidence would
 * make every `register('bibliography')` a `register('evidence.bibliography')`.
 */
export function fieldSchema(f: EvidenceField, stored?: unknown): z.ZodType {
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
      // A conditional box may be empty on its own; `schemaForFields` decides
      return f.optional || f.requiredWhen
        ? z.preprocess(emptyToUndefined, base.min(1).optional())
        : base.min(1, { error: "Обов'язкове поле" });
    }
    case 'number': {
      const min = f.min ?? 0;
      let base = z.coerce
        .number({ error: 'Має бути числом' })
        // «0,5», the Ukrainian separator — as the box and every summary print it
        .min(min, { error: `Мінімальне значення — ${decimalText(min)}` });
      // A ceiling only where the spec sets one. Most numbers here are counts —
      // сторінки, співавтори, дні — and inventing a maximum for those would
      // refuse real work. A YEAR is the case that needs it: «Рік початку» had a
      // floor of 1950 and nothing above, so 123123 was a valid year of
      // employment and printed into the licence document as one.
      if (f.max !== undefined) {
        base = base.max(f.max, { error: `Максимальне значення — ${decimalText(f.max)}` });
      }
      if (f.int) base = base.int({ error: 'Має бути цілим числом' });
      if (f.decimals !== undefined && !f.int) {
        const places = f.decimals;
        return f.optional
          ? z.preprocess(
              (v) => commaToPoint(emptyToUndefined(v)),
              decimalsRefine(base, places, stored).optional()
            )
          : z.preprocess(commaToPoint, decimalsRefine(base, places, stored));
      }
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
      return f.optional || f.requiredWhen ? z.preprocess(emptyToUndefined, base.optional()) : base;
    }
    case 'date': {
      const maxYear = new Date().getFullYear() + 1;
      let base = z.iso.date({ error: 'Некоректна дата' }).refine(
        (v) => {
          const year = Number(v.slice(0, 4));
          return year >= MIN_EVIDENCE_YEAR && year <= maxYear;
        },
        { error: `Рік має бути в межах ${MIN_EVIDENCE_YEAR}–${maxYear}` }
      );
      if (f.rule === 'currentYear') {
        const { min, max } = currentYearBounds();
        // The value already saved is not judged again: in January, last
        // year's article must still take a corrected title. Only a CHANGED
        // date meets the window — the same rule D48 gives the month.
        const kept = (v: string) => v === stored;
        base = base
          .refine((v) => kept(v) || v >= min, {
            error: `Приймаються лише публікації ${min.slice(0, 4)} року`,
          })
          .refine((v) => kept(v) || v <= max, { error: 'Дата не може бути в майбутньому' });
      }
      return f.optional ? z.preprocess(emptyToUndefined, base.optional()) : base;
    }
    case 'dateRange': {
      // Both ends, and the end never before the start. The picker cannot
      // produce an inverted range, so this is here for the request that skips
      // the picker — the half of a shared rule an attacker keeps.
      const day = z.iso
        .date({ error: 'Некоректна дата' })
        .refine((v) => v >= RANGE_MIN_DAY, {
          error: `Дата не може бути раніше ${MIN_EVIDENCE_YEAR} року`,
        })
        .refine((v) => v <= rangeMaxDay(), {
          error: `Дата не може бути пізніше ${rangeMaxDay().slice(0, 4)} року`,
        });
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
      // `requiredWhen` is enforced by `schemaForFields`, which can see the
      // select it names; on its own the box may then be empty.
      return f.optional || f.requiredWhen ? z.preprocess(emptyToUndefined, base.optional()) : base;
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
      return f.optional || f.requiredWhen ? z.preprocess(emptyToUndefined, base.optional()) : base;
    }
    case 'issn': {
      // Stored as «1234-567X», whatever separators were typed
      const base = z
        .string({ error: "Обов'язкове поле" })
        .trim()
        .min(1, { error: "Обов'язкове поле" })
        // An unfinished number is not a wrong check digit — say which it is
        .refine((v) => normalizeIssn(v).length === 8, {
          error: 'ISSN має 8 символів, наприклад 0028-0836',
          abort: true,
        })
        .refine(isValidIssn, { error: 'Некоректний ISSN — перевірте контрольну цифру' })
        .transform((v) => {
          const d = normalizeIssn(v);
          return `${d.slice(0, 4)}-${d.slice(4)}`;
        });
      return f.optional || f.requiredWhen ? z.preprocess(emptyToUndefined, base.optional()) : base;
    }
    case 'checkbox': {
      return f.mustBeTrue
        ? z.literal(true, { error: f.requiredError ?? 'Потрібно підтвердити' })
        : z.boolean({ error: 'Оберіть значення' }).default(false);
    }
    case 'select': {
      const values = f.options.map((o) => o.value) as [string, ...string[]];
      const base = z.enum(values, { error: 'Оберіть значення зі списку' });
      if (f.requiredWhen) return z.preprocess(emptyToUndefined, base.optional());
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
  opts?: {
    allowUnknownKeys?: boolean;
    /** The evidence already saved, when this validates an EDIT — a value left
     *  as it was is not re-judged against a window that has since moved. */
    stored?: Record<string, unknown>;
  }
): z.ZodType<Record<string, unknown>> {
  const shape = Object.fromEntries(
    fields.map((f) => [f.name, fieldSchema(f, opts?.stored?.[f.name])])
  );
  const baseObject = opts?.allowUnknownKeys ? z.object(shape) : z.strictObject(shape);

  // A box required only in some state of the form — a book's ISBN for a
  // монографія, 5.1's fields once «Я лектор» is on, DOI-or-ISSN. The other
  // box is in the same object, so the check lives here. See `FieldCondition`.
  const conditional = fields.flatMap((f) =>
    'requiredWhen' in f && f.requiredWhen ? [{ field: f, when: f.requiredWhen }] : []
  );
  const labelOf = (name: string) => fields.find((f) => f.name === name)?.label ?? name;
  const missing = (when: FieldCondition) =>
    'empty' in when
      ? `Обов'язкове поле, коли не заповнено «${labelOf(when.field)}»`
      : "Обов'язкове поле";
  const object =
    conditional.length === 0
      ? baseObject
      : baseObject
          .superRefine((v, ctx) => {
            const value = v as Record<string, unknown>;
            const groupsDone = new Set<string>();
            for (const { field: f, when } of conditional) {
              if (!conditionMet(when, value)) continue;
              if (f.kind === 'checkbox') {
                // «At least one of the group» — one message for the set
                const key = f.group ?? f.name;
                if (groupsDone.has(key)) continue;
                groupsDone.add(key);
                const members = conditional
                  .map((c) => c.field)
                  .filter((g) => g.kind === 'checkbox' && (g.group ?? g.name) === key);
                if (!members.some((g) => value[g.name] === true)) {
                  ctx.addIssue({
                    code: 'custom',
                    path: [members[0].name],
                    message: 'Позначте хоча б один пункт',
                  });
                }
                continue;
              }
              const answer = value[f.name];
              const blank =
                answer === undefined ||
                answer === null ||
                (typeof answer === 'string' && !answer.trim());
              if (blank) ctx.addIssue({ code: 'custom', path: [f.name], message: missing(when) });
            }
          })
          // A box hidden behind a switch that is off is not part of the answer:
          // what was typed there before the switch went off is dropped.
          .transform((v) => {
            const value = { ...(v as Record<string, unknown>) };
            for (const f of fields) if (!fieldShown(f, value)) delete value[f.name];
            return value;
          });

  // A монографія's personal share has a floor (owner, 2026-10-16): the book
  // divided between its authors, rounded to 0,1, must reach `minShare`. A row
  // whose two numbers are as they were saved is not re-judged.
  const minShare = scoring?.pageBased ? scoring.minShare : undefined;
  if (minShare !== undefined) {
    return object.superRefine((v, ctx) => {
      const e = v as Record<string, unknown>;
      const stored = opts?.stored;
      if (stored && e.sheets === stored.sheets && e.coAuthors === stored.coAuthors) return;
      const share = personalSheets(e);
      if (share === null || share >= minShare) return;
      const coAuthored = Number(e.coAuthors) > 1;
      const min = String(minShare).replace('.', ',');
      ctx.addIssue({
        code: 'custom',
        path: [coAuthored ? 'coAuthors' : 'sheets'],
        message: coAuthored
          ? `На кожного співавтора має припадати не менше ${min} аркуша (зараз — ${String(share).replace('.', ',')})`
          : `Обсяг має бути не менше ${min} друкованого аркуша`,
      });
    }) as unknown as z.ZodType<Record<string, unknown>>;
  }

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

/** «Не більше одного знака після коми» — for a друкований аркуш («1,7», never «1,73») */
// A value ALREADY saved is not re-judged (it may be a «1,73» from before the limit),
// so correcting another box of the record does not hit a wall.
function decimalsRefine(
  base: ReturnType<typeof z.coerce.number>,
  places: number,
  stored?: unknown
) {
  return base.refine((v) => v === Number(stored) || !hasTooManyDecimals(v, places), {
    error:
      places === 1
        ? 'Не більше одного знака після коми'
        : places === 0
          ? 'Має бути цілим числом'
          : `Не більше ${places} знаків після коми`,
  });
}
