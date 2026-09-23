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
 */

export type ProofRule = 'REQUIRED' | 'OPTIONAL' | 'NONE';

/** Shown when a file reaches a type whose file rule is NONE. */
export const FILE_NOT_ALLOWED = 'Для цього виду роботи додається лише посилання, без файлу';

/** Shown when a link reaches a type whose link rule is NONE. */
export const LINK_NOT_ALLOWED = 'Для цього виду роботи посилання не додається — лише файл';

export function evidenceProblem(input: {
  linkRule: ProofRule;
  fileRule: ProofRule;
  link: string | null;
  fileCount: number;
}): string | null {
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
  if (!hasLink && !hasFile) {
    return 'Додайте посилання або файл підтвердження';
  }
  return null;
}

/** The pair ADMIN may save: a вид роботи nothing could prove is refused. */
export function proofRulesProblem(linkRule: ProofRule, fileRule: ProofRule): string | null {
  return linkRule === 'NONE' && fileRule === 'NONE'
    ? 'Має бути хоча б один спосіб підтвердження'
    : null;
}
