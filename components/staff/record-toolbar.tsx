import { cn } from '@/lib/utils';

/**
 * The pieces a record tab's controls are built from — a strip, a divider, a row.
 *
 * **No portal, and no parallel route either** (2026-09-09). The controls belong
 * to the TAB and the row belongs above it, and a child cannot hand anything to
 * its parent, so two mechanisms were built to cross that gap and both were
 * removed:
 *
 * 1. **A client portal** — the page rendered them hidden and JavaScript moved
 *    them into the row after hydration. On a hard reload the move failed
 *    outright: the row stayed empty until you switched tabs and back.
 * 2. **A `@toolbar` parallel route** — server-rendered and correct once settled,
 *    but on every initial load the tab BODY streamed into the slot's position
 *    for a frame, so the row grew to 547px with the tab bar centred beside a
 *    column of cards. Moving the slot out of the row did not help; the body
 *    followed it.
 *
 * The row moved into each tab's page instead, and these are what is left: three
 * pieces of layout with no behaviour.
 */

/**
 * One bordered strip on the record's tab row.
 *
 * Every tab's controls live in exactly one of these, so the row reads as a
 * single object beside the tab bar rather than a scatter of loose buttons.
 * Before 2026-09-09 the Характеристика put its «8 з 20» in a strip and then set
 * the Excel button loose next to it, while the account controls sat in a third
 * — three shapes on one row for what is one toolbar.
 *
 * `p-1` around `h-8` controls comes to the tab bar's own height, so the two
 * read as one row rather than as two things that happen to be adjacent.
 */
export function ToolbarGroup({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-lg border bg-card p-1 shadow-xs',
        className
      )}
    >
      {children}
    </div>
  );
}

/** A hairline between two groups of controls inside one `ToolbarGroup`. */
export function ToolbarDivider() {
  return <span aria-hidden className="h-5 w-px shrink-0 bg-border" />;
}

/**
 * The row a tab bar and its controls share: bar left, controls right.
 *
 * **One definition, because there are two callers that must agree** — the real
 * row and its skeleton. They each hand-wrote `flex flex-wrap items-center
 * justify-between gap-3`, which is the same drift that made the card skeletons
 * need a ruler to line up: change the row here and the placeholder stops
 * matching, silently. The class string now exists once.
 *
 * `justify-between` and not a gap: the controls belong to the right edge, and a
 * tab with none simply leaves it empty rather than pulling the bar off-centre.
 */
export function ToolbarRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center justify-between gap-3">{children}</div>;
}
