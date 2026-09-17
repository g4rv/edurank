/**
 * D27 — what proves a record.
 *
 * The owner's rule (2026-09-17): **a link proves anything with a public
 * record; a file is only for a document that exists only in the person's own
 * hands** — a сертифікат downloaded from a personal cabinet, or one that
 * arrived by email. A наказ, a патент and a свідоцтво are public and are
 * proved by a link, which is the correction that rewrote the spec's first
 * reading of the наказ's «Форма звітності» column.
 *
 * The choice belongs to the RECORD, not only to the work type, because the
 * same сертифікат is a public URL for one person and a PDF in an inbox for
 * another — same вид роботи, same year, different evidence. So the rule is:
 * **at least one of link or file, never neither.**
 *
 * `ScienceWorkType.requiresFile` survives and narrows: it no longer means
 * «this type is proved by a file», it means «a link alone is not enough for
 * this type». Expect it on very few rows.
 *
 * Why «never neither» is refused at all: the owner's reason for moving off
 * paper is that people «tend to photoshop their certificates and print them on
 * paper». A typed name is weaker than the paper it replaces — and unlike
 * paper, a file can at least be hashed, kept, and looked at again next year.
 */
export function evidenceProblem(input: {
  requiresFile: boolean;
  link: string | null;
  fileCount: number;
}): string | null {
  const hasLink = Boolean(input.link?.trim());
  const hasFile = input.fileCount > 0;

  // Checked first on purpose: with nothing attached at all, both rules fire,
  // and the useful sentence is the one naming what THIS вид роботи needs.
  if (input.requiresFile && !hasFile) {
    return 'Для цього виду роботи потрібен файл підтвердження';
  }
  if (!hasLink && !hasFile) {
    return 'Додайте посилання або файл підтвердження';
  }
  return null;
}
