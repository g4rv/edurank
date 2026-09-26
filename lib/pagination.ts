const ELLIPSIS = 'ellipsis' as const;

export type PageItem = number | typeof ELLIPSIS;

/**
 * Page numbers with gaps collapsed, always seven slots wide once there are
 * more than seven pages — so the pager keeps its width as you move through it.
 *
 *   near the start  1 2 3 4 5 … 46      (pages 1–4)
 *   in the middle   1 … 19 20 21 … 46
 *   near the end    1 … 42 43 44 45 46  (the last four pages)
 *
 * It used to show only the neighbours of the current page, so page 1 of 46 was
 * «1 2 … 46» — three numbers to click, and a reader at the start had to step
 * through the list one page at a time (owner, 2026-09-26). Five at the ends
 * gives them somewhere to go without moving the ellipsis under their cursor.
 *
 * **Logic, not drawing**, which is why it lives here rather than beside either
 * pager. `components/aurora/ui/pagination.tsx` used to import it from
 * `components/ui/pagination.tsx` — deliberately, so there was one copy — and
 * that import was the last thing keeping the old component alive once every
 * caller had moved to the Аврора one.
 */
export function pageItems(page: number, totalPages: number): PageItem[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);

  if (page <= 4) return [1, 2, 3, 4, 5, ELLIPSIS, totalPages];

  if (page >= totalPages - 3) {
    return [1, ELLIPSIS, ...Array.from({ length: 5 }, (_, i) => totalPages - 4 + i)];
  }

  return [1, ELLIPSIS, page - 1, page, page + 1, ELLIPSIS, totalPages];
}
