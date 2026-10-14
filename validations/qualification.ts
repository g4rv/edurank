import { z } from 'zod';
import { KYIV } from '@/lib/kyiv-time';
import { formatIssuedOn } from '@/lib/qualifications/format';
import { DOCUMENT_TYPES, QUALIFICATION_KINDS } from '@/lib/qualifications/options';
import { qualificationMinDate } from '@/lib/qualifications/window';
import { optionalWebLink } from '@/validations/web-link';

// One запис про підвищення кваліфікації / стажування (owner, 2026-10-13).
//
// The schema reads what a FORM holds — strings — and hands the server numbers.
// Both the dialog and the action parse with it, so a request made outside the
// UI meets the same rules the form shows. The action turns `credits` into
// integer hundredths before storing (the rule `lib/stake/units.ts` states for
// ставки; ECTS credits come in halves) — a float never reaches the database.

/** Today in Kyiv, `YYYY-MM-DD`. A document is never issued tomorrow. */
export function todayInKyiv(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', KYIV);
}

const required = (message: string, max = 300) =>
  z
    .string({ error: message })
    .transform((value) => value.trim().replace(/\s+/g, ' '))
    .pipe(z.string().min(1, { error: message }).max(max, { error: 'Занадто довге значення' }));

/** Trimmed, runs of spaces collapsed; blank and absent both become `null`. */
const optionalText = (max: number) =>
  z
    .string()
    .optional()
    .transform((value) => (value ?? '').trim().replace(/\s+/g, ' '))
    .pipe(z.string().max(max, { error: 'Занадто довге значення' }))
    .transform((value) => (value === '' ? null : value));

/** «1,5» and «1.5» both. Empty is a missing value, not zero. */
function decimal(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const text = value.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  return Number(text);
}

export const MAX_CREDITS = 500;

const credits = z
  .union([z.string(), z.number()], { error: 'Вкажіть кількість кредитів' })
  .transform((value, ctx) => {
    const parsed = decimal(value);
    if (parsed === null) {
      ctx.addIssue({ code: 'custom', message: 'Вкажіть кількість кредитів числом' });
      return z.NEVER;
    }
    if (parsed > MAX_CREDITS) {
      ctx.addIssue({ code: 'custom', message: `Не більше ${MAX_CREDITS} кредитів` });
      return z.NEVER;
    }
    // At most two decimals: a third would be silently rounded away when the
    // action stores hundredths.
    if (Math.abs(parsed * 100 - Math.round(parsed * 100)) > 1e-9) {
      ctx.addIssue({ code: 'custom', message: 'Не більше двох знаків після коми' });
      return z.NEVER;
    }
    return parsed;
  });

/**
 * The date on the document: a real calendar day, not in the future, and inside
 * the last five calendar years (`lib/qualifications/window.ts`).
 *
 * `keepDate` is the date a record ALREADY has, so correcting a typo in an old
 * record does not force its date to change — only a NEW date must be in range.
 */
function issuedOnFor(keepDate?: string) {
  return z
    .string({ error: 'Вкажіть дату видачі' })
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'Вкажіть дату видачі' })
    .refine((v) => !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime()), {
      error: 'Вкажіть дату видачі',
    })
    .refine((v) => v <= todayInKyiv(), { error: 'Дата не може бути в майбутньому' })
    .refine((v) => v >= qualificationMinDate() || v === keepDate, {
      // A function, so the date in the sentence is read when it is refused, not
      // when this module loaded — a server that runs across 1 вересня stays right.
      error: () =>
        `Враховуються документи за останні 5 років — не раніше ${formatIssuedOn(qualificationMinDate())}`,
    });
}

export function qualificationSchemaFor(options: { keepDate?: string } = {}) {
  return z.object({
    kind: z.enum(QUALIFICATION_KINDS, { error: 'Оберіть вид' }),
    institution: required('Вкажіть найменування закладу'),
    documentType: z.enum(DOCUMENT_TYPES, { error: 'Оберіть вид документа' }),
    /** Optional: a довідка often has no series. Empty becomes null. */
    series: optionalText(50),
    /** Optional: some certificates carry no number at all (owner, 2026-10-14). */
    number: optionalText(100),
    /** Optional link to the document — http(s) only. */
    url: optionalWebLink,
    /** The тема, or the спеціальність when the document is a диплом. */
    topic: required('Вкажіть тему або спеціальність', 500),
    issuedOn: issuedOnFor(options.keepDate),
    /** Навчальні кредити, e.g. 1.5 — the action stores them as hundredths. */
    credits,
  });
}

/** The schema for a NEW record. An edit passes `keepDate` — see `issuedOnFor`. */
export const qualificationSchema = qualificationSchemaFor();

/** What the dialog holds (strings) — the schema's INPUT. */
export type QualificationFormValues = z.input<typeof qualificationSchema>;
/** What the server works with — the schema's OUTPUT. */
export type QualificationData = z.output<typeof qualificationSchema>;
