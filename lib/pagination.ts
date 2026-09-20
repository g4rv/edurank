const ELLIPSIS = 'ellipsis' as const;

export type PageItem = number | typeof ELLIPSIS;

/**
 * Page numbers with gaps collapsed: always the first and last page, the current
 * one and its neighbours, and an ellipsis wherever a run was dropped.
 * e.g. page 7 of 20 → 1 … 6 7 8 … 20
 *
 * **Logic, not drawing**, which is why it lives here rather than beside either
 * pager. `components/aurora/ui/pagination.tsx` used to import it from
 * `components/ui/pagination.tsx` — deliberately, so there was one copy — and
 * that import was the last thing keeping the old component alive once every
 * caller had moved to the Аврора one.
 */
export function pageItems(page: number, totalPages: number): PageItem[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);

  const items: PageItem[] = [1];
  const from = Math.max(2, page - 1);
  const to = Math.min(totalPages - 1, page + 1);

  if (from > 2) items.push(ELLIPSIS);
  for (let p = from; p <= to; p++) items.push(p);
  if (to < totalPages - 1) items.push(ELLIPSIS);

  items.push(totalPages);
  return items;
}
