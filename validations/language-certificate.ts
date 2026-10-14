import { z } from 'zod';
import { KYIV } from '@/lib/kyiv-time';
import { CERTIFICATE_MIN_DATE, ENGLISH_LEVELS } from '@/lib/language-certificates/options';
import { optionalWebLink as url } from '@/validations/web-link';

// The two language certificates in an НПП's «Освіта» (owner, 2026-10-14).
//
// **A certificate is optional as a whole, and strict once begun.** A person with
// none leaves the block empty and nothing is stored. The moment anything is
// typed — or a scan is picked — the fields the document cannot do without
// (номер, дата видачі, and для кожного свій третій) become required, so a half
// certificate is never saved. Серія and the link are optional on both. (Номер
// was optional for a few hours on 2026-10-14; the owner took it back — a
// language certificate keeps its number mandatory.)
//
// Both certificates read what a FORM holds — strings, blank for «nothing» — and
// hand the server `null` for an empty block. `file` is the staged scan, and
// follows the qualifications' rule: absent keeps what is stored, `null` takes it
// away, an object replaces it.

/** Today in Kyiv, `YYYY-MM-DD`. */
function today(): string {
  return new Date().toLocaleDateString('en-CA', KYIV);
}

/** Trimmed, runs of spaces collapsed; blank is «nothing». */
const text = (max: number) =>
  z.preprocess(
    (v) => {
      if (typeof v !== 'string') return null;
      const folded = v.trim().replace(/\s+/g, ' ');
      return folded === '' ? null : folded;
    },
    z.string().max(max, { error: 'Занадто довге значення' }).nullable()
  );

/** A real calendar day inside the certificate window, or blank. */
const day = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null),
  z
    .string()
    .nullable()
    // One verdict per date — the first thing wrong, never a pile of them.
    .superRefine((v, ctx) => {
      if (v === null) return;
      const problem =
        !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(new Date(`${v}T00:00:00Z`).getTime())
          ? 'Вкажіть дату'
          : v < CERTIFICATE_MIN_DATE
            ? 'Занадто рання дата'
            : v > today()
              ? 'Дата не може бути в майбутньому'
              : null;
      if (problem) ctx.addIssue({ code: 'custom', message: problem });
    })
);

/**
 * The scan chosen in the form. Only the key and the name the person saw: the
 * server rebuilds everything else from the STORED bytes, never from this.
 */
export const certificateFile = z
  .object({
    objectKey: z.string().min(1),
    fileName: z.string().min(1).max(300),
  })
  .nullable()
  .optional();

export type CertificateFile = z.infer<typeof certificateFile>;

type Issue = (path: string, message: string) => void;

function requireFilled(
  value: Record<string, unknown>,
  rules: readonly [field: string, message: string][],
  issue: Issue
) {
  for (const [field, message] of rules) {
    if (value[field] === null || value[field] === undefined || value[field] === '') {
      issue(field, message);
    }
  }
}

/** True when the person has put anything at all into the block. */
function touched(value: Record<string, unknown>): boolean {
  return Object.values(value).some((v) => v !== null && v !== undefined && v !== '');
}

const addIssue =
  (ctx: z.RefinementCtx): Issue =>
  (path, message) =>
    ctx.addIssue({ code: 'custom', message, path: [path] });

const englishBlock = z
  .object({
    series: text(50),
    number: text(100),
    url,
    // B2 and up (owner, 2026-10-14). Never required here: the popup starts every
    // certificate on B2, so a person always has one, and a stored certificate
    // from before the level existed must still save.
    level: z.preprocess(
      (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null),
      z.enum(ENGLISH_LEVELS, { error: 'Оберіть рівень зі списку' }).nullable()
    ),
    issuedBy: text(300),
    issuedOn: day,
    file: certificateFile,
  })
  .superRefine((v, ctx) => {
    if (!touched(v)) return;
    requireFilled(
      v,
      [
        ['number', 'Вкажіть номер'],
        ['issuedBy', 'Вкажіть, ким виданий'],
        ['issuedOn', 'Вкажіть дату видачі'],
      ],
      addIssue(ctx)
    );
  })
  .transform((v) => (touched(v) ? v : null));

const ukrainianBlock = z
  .object({
    series: text(50),
    number: text(100),
    url,
    // Free text, as the certificate words it (owner, 2026-10-14) — required once
    // the certificate is begun, below.
    level: text(50),
    decisionNumber: text(100),
    decisionDate: day,
    issuedOn: day,
    file: certificateFile,
  })
  .superRefine((v, ctx) => {
    if (!touched(v)) return;
    const issue = addIssue(ctx);
    requireFilled(
      v,
      [
        ['number', 'Вкажіть номер'],
        ['level', 'Вкажіть рівень володіння'],
        ['issuedOn', 'Вкажіть дату видачі'],
      ],
      issue
    );
    // The decision is one fact in two boxes: a number with no date, or a date
    // with no number, says nothing.
    if (v.decisionNumber && !v.decisionDate) issue('decisionDate', 'Вкажіть дату рішення');
    if (v.decisionDate && !v.decisionNumber) issue('decisionNumber', 'Вкажіть номер рішення');
  })
  .transform((v) => (touched(v) ? v : null));

/**
 * **A schema must accept its own OUTPUT.** The form hands the server what the
 * resolver produced, and an empty block produces `null` — which is then parsed
 * AGAIN by the action. Without this, saving any profile whose other certificate
 * was left empty answered «Невірні дані» (found in the browser, 2026-10-14):
 * `null` (and an absent value) is an empty block, same as an object of blanks.
 */
const emptyBlock = (v: unknown) => (v === null || v === undefined ? {} : v);

export const englishCertificateSchema = z.preprocess(emptyBlock, englishBlock);
export const ukrainianCertificateSchema = z.preprocess(emptyBlock, ukrainianBlock);

/** What the server works with — `null` is an empty block. */
export type EnglishCertificateData = z.output<typeof englishCertificateSchema>;
export type UkrainianCertificateData = z.output<typeof ukrainianCertificateSchema>;
export type CertificateData = NonNullable<EnglishCertificateData | UkrainianCertificateData>;
