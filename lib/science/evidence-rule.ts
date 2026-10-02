/**
 * D27 + D47 — what proves a record.
 *
 * The owner's rule (2026-09-17): **a link proves anything with a public
 * record; a file is only for a document that exists only in the person's own
 * hands** — a сертифікат downloaded from a personal cabinet, or one that
 * arrived by email. A наказ, a патент and a свідоцтво are public and are
 * proved by a link.
 *
 * **The link and the file are two separate proofs with two separate rules**
 * (D47, owner 2026-09-23), set by ADMIN per вид роботи as
 * `ScienceWorkType.linkRule` / `fileRule`:
 *
 *   - `REQUIRED` — must be given;
 *   - `OPTIONAL` — offered, may be left empty;
 *   - `NONE` — not offered, and a proof on that side counts for nothing.
 *
 * Across the pair one rule survives from D27: **when neither side is
 * REQUIRED, at least one of the two must still be given.** The choice belongs
 * to the RECORD there, because the same сертифікат is a public URL for one
 * person and a PDF in an inbox for another.
 *
 * Why «never neither» is refused at all: the owner's reason for moving off
 * paper is that people «tend to photoshop their certificates and print them on
 * paper». A typed name is weaker than the paper it replaces — and unlike
 * paper, a file can at least be hashed, kept, and looked at again next year.
 *
 * **A DOI is a third proof** (owner, 2026-10-02). On a вид роботи whose form
 * has a DOI field — the стаття — a filled DOI proves the work as well as a link
 * does, so «at least one» there means link OR DOI (OR file, where offered). The
 * DOI stays its own field and the link box refuses one (`linkProblem`): pasted
 * as a link, the same DOI keyed as two different works.
 */

import { isValidDoi } from '@/lib/doi';

export type ProofRule = 'REQUIRED' | 'OPTIONAL' | 'NONE';

/** Shown when a DOI is typed into the link box of a вид роботи that has a DOI field. */
export const DOI_IN_LINK =
  'Це DOI — вкажіть його в полі «DOI», а тут — посилання на сторінку роботи';

/**
 * The DOI a record carries, read from its evidence — `undefined` when the
 * вид роботи has no DOI field at all, so `evidenceProblem` knows not to offer it.
 */
export function doiProof(
  fields: readonly { kind: string; name: string }[],
  evidence: unknown
): string | null | undefined {
  // A JSON column read straight off a row — anything but a list means no fields.
  const field = Array.isArray(fields) ? fields.find((f) => f.kind === 'doi') : undefined;
  if (!field) return undefined;
  const value =
    evidence && typeof evidence === 'object'
      ? (evidence as Record<string, unknown>)[field.name]
      : undefined;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** A DOI in the link box, on a type that asks for the DOI separately. */
export function linkProblem(link: string | null, doiOffered: boolean): string | null {
  return doiOffered && link && isValidDoi(link) ? DOI_IN_LINK : null;
}

/** Shown when a file reaches a type whose file rule is NONE. */
export const FILE_NOT_ALLOWED = 'Для цього виду роботи додається лише посилання, без файлу';

/** Shown when a link reaches a type whose link rule is NONE. */
export const LINK_NOT_ALLOWED = 'Для цього виду роботи посилання не додається — лише файл';

export function evidenceProblem(input: {
  linkRule: ProofRule;
  fileRule: ProofRule;
  link: string | null;
  fileCount: number;
  /** From `doiProof`: the record's DOI, `null` when empty, `undefined` when
   *  the вид роботи has no DOI field. */
  doi?: string | null;
}): string | null {
  // **Both NONE = no proof needed** (owner, 2026-09-24). A вид роботи an
  // ADMIN has set to neither link nor file — «Керівництво аспірантами» first —
  // is recorded by its details alone. D27's «never neither» still holds
  // wherever one of the two is offered.
  if (input.linkRule === 'NONE' && input.fileRule === 'NONE') return null;

  // A proof on a NONE side proves nothing — a file left over from before a
  // type became link-only must not stand in for the link it now needs.
  const hasLink = input.linkRule !== 'NONE' && Boolean(input.link?.trim());
  const hasFile = input.fileRule !== 'NONE' && input.fileCount > 0;

  // The file first: with nothing attached at all on a type that requires
  // both, one specific sentence is more use than two, and the file is the
  // one a person has to go and find.
  if (input.fileRule === 'REQUIRED' && !hasFile) {
    return 'Для цього виду роботи потрібен файл підтвердження';
  }
  if (input.linkRule === 'REQUIRED' && !hasLink) {
    return 'Для цього виду роботи потрібне посилання';
  }
  const hasDoi = Boolean(input.doi);
  if (!hasLink && !hasFile && !hasDoi) {
    // Name exactly the proofs this вид роботи offers.
    const offered = [
      input.linkRule !== 'NONE' && 'посилання',
      input.doi !== undefined && 'DOI',
      input.fileRule !== 'NONE' && 'файл підтвердження',
    ].filter((x): x is string => Boolean(x));
    const list =
      offered.length > 1
        ? `${offered.slice(0, -1).join(', ')} або ${offered[offered.length - 1]}`
        : offered[0];
    return `Додайте ${list}`;
  }
  return null;
}

/**
 * The pair ADMIN may save. Every pair is legal since 2026-09-24: both NONE
 * used to be refused as «a вид роботи nothing could prove», and is now how an
 * ADMIN says a вид роботи needs no proof at all. Kept as the one place a
 * future constraint on the pair would go.
 */
export function proofRulesProblem(_linkRule: ProofRule, _fileRule: ProofRule): string | null {
  return null;
}

/**
 * What the link box is called on the record form.
 *
 * Where a file cannot stand in for it (`fileRule` NONE) the link is not a
 * separate «proof» of something else — it IS the work: the article's page, the
 * book's page. «Посилання на підтвердження» there sat under a form with no other
 * proof and read as a second link to ask for. Where a file is allowed the link
 * really is one of two proofs, and the old wording stays.
 */
export function linkLabel(fileRule: ProofRule): string {
  return fileRule === 'NONE' ? 'Посилання на роботу' : 'Посилання на підтвердження';
}

/** The line under the link box — from the наказ's «Форма звітності» where a file may also be given. */
export function linkHint(type: {
  fileRule?: ProofRule;
  reportingForm?: string | null;
  fields?: readonly { kind: string }[];
}): string {
  // The стаття: link OR DOI, at least one (owner, 2026-10-02).
  if (type.fields?.some((f) => f.kind === 'doi')) {
    return 'Сторінка, де опубліковано роботу. Можна не вказувати, якщо нижче є DOI.';
  }
  if (type.fileRule === 'NONE') {
    return 'Джерело, яке підтверджує виконання роботи.';
  }
  return type.reportingForm
    ? `${type.reportingForm} — посилання на сторінку, де це опубліковано.`
    : 'Сторінка, яку можна відкрити: DOI, сайт видання, репозитарій, наказ.';
}
