import type { EvidenceField } from '@/lib/rating/evidence-fields';

/**
 * Where the link box goes among a вид роботи's own fields (owner, 2026-09-30).
 *
 * The record form used to end with the link, after every field — so the address
 * of the work came last, a page away from its name. The order people asked for
 * puts what IDENTIFIES the work together at the top: its name, what kind of
 * work it is, and its link; then the details (DOI, pages, dates) and, last, who
 * shares it. For the стаття:
 *
 *   Назва → Категорія → Посилання → DOI → Кількість сторінок → Дата → Співавтори
 *
 * The link follows the first CHOICE field — the category of an article, the
 * kind of edition of a book, the role in a project — because that is the
 * second thing a person says about a work. A вид роботи with no choice puts it
 * right after the title. Nothing else about the fields' order is decided here:
 * that stays the catalogue's, editable by an ADMIN, and everything after the
 * anchor keeps its place.
 *
 * Never splits a joined group (a ПІБ in three boxes): the anchor is a choice
 * field or the title, and the groups the catalogue builds sit before either.
 */
export function splitAtLink(fields: readonly EvidenceField[]): {
  before: EvidenceField[];
  after: EvidenceField[];
} {
  if (fields.length === 0) return { before: [], after: [] };

  const choice = fields.findIndex((f) => f.kind === 'select');
  const title = fields.findIndex((f) => f.name === 'title');
  // No choice and no title: the link ends the form, as it always did.
  let anchor = choice !== -1 ? choice : title !== -1 ? title : fields.length - 1;
  // A book's ISBN belongs to what IDENTIFIES it, so it sits before the link
  // (owner, 2026-09-30): Назва → Вид → ISBN → Посилання. Only an ISBN — an
  // article's DOI, right after its category, stays after the link.
  if (fields[anchor + 1]?.kind === 'isbn') anchor += 1;

  return { before: fields.slice(0, anchor + 1), after: fields.slice(anchor + 1) };
}
