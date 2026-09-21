import Link from 'next/link';
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * «Аврора»'s table.
 *
 * The app had two table looks and neither was this one: the shared `DataTable`
 * (zebra rows plus a divider between every column) and, on the rating, ставки
 * and кафедра screens, a hand-rolled grid with `border border-border` on every
 * single cell. The second reads as a spreadsheet — four boxed compartments per
 * row, a rule under every value — which is the 1990s-form look §7 already
 * refuses for form fields, arriving through the back door.
 *
 * ## The shape
 *
 * **Three tables, one card, one set of column widths.** The header is its own
 * `<table>` above the scroll box, the rows scroll between, and the footer is a
 * third `<table>` pinned below. So the column heads and the grand total stay on
 * screen — and, the reason it is built this way rather than with a sticky
 * `<thead>`, the scrollbar runs beside the ROWS only, instead of down the whole
 * card past a header it has nothing to do with (owner, 2026-09-08).
 *
 * That costs one thing and it is not optional: **`columns` must be given.**
 * Three separate tables cannot agree on widths by measuring their own content,
 * so all three take `table-layout: fixed` and share one `<colgroup>`. Declaring
 * the widths once is what keeps them aligned.
 *
 * Header, body and footer each reserve a scrollbar gutter —
 * `scrollbar-gutter: stable`, which applies to any scroll container including an
 * `overflow: hidden` one. Without it on all three, the two that never scroll are
 * a scrollbar's width wider than the one that does, and every column sits off by
 * that much.
 *
 * ## The look
 *
 * **1. Cells are separated by ONE hairline, not boxed.** A rule between the
 * columns, a rule between the rows, and nothing else — no border around every
 * cell, and none down the outer edges, which the card's own border already
 * draws. A row stops being four bordered compartments and becomes one line you
 * read across, while the columns keep the guide a dense table of figures needs.
 *
 * Dividers were tried and dropped here first (2026-09-08), on the argument that
 * alignment already separates a column. It does — but `DataTable` draws them on
 * the app's nine other lists, so leaving them out would have re-created the two
 * table looks this component exists to end.
 *
 * **2. The header carries no fill of its own.** `--muted` is `oklch(0.97)`
 * against a `--card` of `oklch(1)`: enough for a band you scan past, not enough
 * to hold up a header. Weight, capitals and letter-spacing do it instead.
 *
 * **3. Group rows DO take `bg-muted`.** The same token, doing a different job:
 * you have to find these while scrolling, and inside a card the step is real.
 * §1 bans `--muted` for separation on the PAGE, where the ground is `oklch(.977)`
 * and the pair measured 1.01:1 — a fact about the page ground, not the token.
 *
 * **4. Hover is opt-in.** `DataTable` lights every row because its rows are
 * links. A read-only table that highlights under the cursor promises a click
 * that does nothing, so `hoverable` is a prop and defaults off.
 *
 * **5. Section headings stick inside the scroll box, and they STACK.** A heading
 * holds the top of the rows and is pushed out by the next one, so what is on
 * screen always names the rows beneath it. Two things this depends on: sticky
 * goes on the CELLS (Chrome does not honour it on a `<tr>` at all), and each
 * section is its own `<tbody>` — a sticky cell cannot leave its own sectioning
 * box, which is what makes Розділ 1's heading give way to Розділ 2's instead of
 * piling up with it.
 */
export function Table({
  columns,
  head,
  footer,
  footerClassName,
  fill = false,
  minWidth,
  className,
  containerClassName,
  children,
}: {
  /**
   * One CSS width per column, in order. `null` means «take what is left» — give
   * it to the column that should absorb the slack, usually the label.
   *
   * Required, because three tables cannot agree on widths by measuring.
   */
  columns: readonly (string | null)[];
  /** The header row(s). Rendered in their own table, outside the scroll box. */
  head: React.ReactNode;
  /** A pinned footer row, e.g. a grand total. Also outside the scroll box. */
  footer?: React.ReactNode;
  /**
   * The footer strip's own colour, when the default accent is wrong for it.
   *
   * It has to be on the STRIP rather than on the row: a cell background stops
   * at the table's edge, and the strip is a scrollbar's width wider than that,
   * so tinting the row leaves a bare band down its right-hand end. The
   * Характеристика's summary is green or amber depending on whether the person
   * clears the licence bar, which is a status rather than an accent.
   */
  footerClassName?: string;
  /**
   * Take whatever height is left instead of a guessed one.
   *
   * The default caps the card at `calc(100svh - 16rem)`, where the 16rem is an
   * ESTIMATE of the furniture above it — and an estimate that is fifty pixels
   * generous leaves the page scrolling anyway, which is the whole thing the cap
   * was meant to prevent.
   *
   * `fill` asks the layout instead. It requires every ancestor up to a
   * height-bounded one to be `flex min-h-0 flex-col`; `main` in the dashboard
   * shell already is bounded (`h-screen`), so what is needed is the chain down
   * from it. Where that chain does not exist the flex rules are inert and the
   * card simply grows, so nothing breaks — it just does not fill.
   *
   * **It is a CEILING, not a height** (owner, 2026-09-21). `flex-1` alone is
   * «grow to fill», so five administrative staff came with 600px of empty card
   * under them. `flex-1 max-h-fit` is the shape actually wanted: grow into the
   * space there is, but never past the rows there are.
   *
   * `flex: 0 1 auto` was tried first and is the trap. It sizes to the content
   * and lets the flex algorithm shrink it — which works, and then shrinks the
   * SIBLINGS too, in proportion to their bases. On `/science-plans` the stat
   * strip above the table collapsed from 80px to about 16, because a card with
   * a 3181px basis leaves a sibling no share of the overflow worth having. It
   * would have needed `shrink-0` on every piece of furniture on every page
   * that uses `fill`. `max-h-fit` needs nothing from anybody: the card only
   * ever grows, so nothing else is asked to give anything up.
   */
  fill?: boolean;
  /**
   * The narrowest the columns may get before the card scrolls sideways.
   *
   * **Without it a narrow window does not squeeze the table, it breaks it.**
   * `table-layout: fixed` honours the declared widths first and hands what is
   * LEFT to the `null` column — so once the declared widths alone exceed the
   * card, «what is left» is zero or less, the name column collapses to nothing
   * and every name in it paints straight over the column beside it. Measured on
   * a 1280px window: `/staff` and `/science-plans` both did exactly this, and
   * neither is an unusual size — it is a laptop.
   *
   * Give it the sum of the declared widths plus a floor for the `null` one.
   * Below that the card scrolls horizontally and all three tables move
   * together, which is what the scroller around them is for: the header cannot
   * be its own scroll container, or it would stay behind while the rows moved.
   *
   * **Opt-in.** A table that leaves it out behaves exactly as before — the
   * widths still collapse, and that is a bug it has not adopted the fix for
   * rather than one this prop introduced.
   */
  minWidth?: string;
  /** On every `<table>`. */
  className?: string;
  /**
   * On the card. Mostly to retune the height:
   * `containerClassName="[--table-max-h:calc(100svh-20rem)]"`
   */
  containerClassName?: string;
  /** The `<tbody>` elements — one per section when sections are used. */
  children: React.ReactNode;
}) {
  const cols = (
    <colgroup>
      {columns.map((width, i) => (
        <col key={i} style={width ? { width } : undefined} />
      ))}
    </colgroup>
  );

  // `table-fixed` on all three, so the colgroup is authoritative rather than a
  // hint each table re-negotiates against its own content.
  const table = cn('w-full table-fixed text-sm', DIVIDERS, className);

  return (
    <div
      className={cn(
        // The card is the height budget; the rows inside it are what scrolls, so
        // a page holding one stays a single screen (owner, 2026-09-08).
        //
        // `svh`, not `vh`: on a phone `vh` is the tallest the viewport ever gets,
        // so the last rows would sit under the browser's own chrome until it
        // retracts.
        //
        // The 16rem is the furniture above the table on the rating tab — the
        // identity band, the tabs, the switch. A caller with a different header
        // retunes it through `containerClassName` rather than editing this file.
        'flex w-full flex-col overflow-hidden rounded-xl border bg-card shadow-card',
        // `max-h-fit` is what turns «fill the space» into «up to the space».
        // With a short list `fit-content` resolves to the rows' own height and
        // binds; with a long one it resolves to the space available and does
        // not, so the card fills and the body scrolls exactly as before.
        fill
          ? 'max-h-fit min-h-0 flex-1'
          : 'max-h-(--table-max-h) [--table-max-h:calc(100svh-16rem)]',
        containerClassName
      )}
    >
      {/* **One horizontal scroller around all three tables.** Each of them is
          its own scroll container vertically, and none of them may be one
          horizontally: the header would stay put while the rows slid under it.
          Scrolling the box that holds all three moves them as one.

          Inert until `minWidth` is given — `overflow-x` stays `visible`, which
          is what every table built before this prop existed already had. */}
      <div
        className={cn('flex min-h-0 flex-auto flex-col', minWidth && 'overflow-x-auto')}
        style={minWidth ? ({ '--table-min-w': minWidth } as React.CSSProperties) : undefined}
      >
        {/* `overflow-hidden` makes this a scroll container, which is what lets
          `scrollbar-gutter` apply — it gives up the same strip the rows below
          do, so the columns line up. Nothing here ever actually scrolls. */}
        {/* No `border-b`. The first section heading below already draws a rule on
          its top edge, and the two together came out as one heavy 2px band
          (owner, 2026-09-08). One line, drawn by one thing.

          A table whose body opens with an ordinary row rather than a section
          heading would have no separator here — neither caller does, and §11
          says to wait for the one that does rather than guess at it now. */}
        <div className={cn('shrink-0 overflow-hidden [scrollbar-gutter:stable]', FLOOR)}>
          <table className={table}>
            {cols}
            <thead>{head}</thead>
          </table>
        </div>

        {/* **`flex-auto`, never `flex-1`.** `flex-1` sets `flex-basis: 0`, and a
          card that sizes to its content then measures this box as zero: header
          plus nothing plus footer, a table with no rows in it. `flex: 1 1 auto`
          starts from the rows' own height and shrinks from there. */}
        <div className={cn('min-h-0 flex-auto overflow-y-auto [scrollbar-gutter:stable]', FLOOR)}>
          <table className={table}>
            {cols}
            {children}
          </table>
        </div>

        {footer && (
          // `bg-brand/10` here rather than on the row: this is the number the
          // page exists to show, §3 gives the accent to it, and only the strip
          // reaches across the scrollbar gutter.
          <div
            className={cn(
              'shrink-0 overflow-hidden border-t [scrollbar-gutter:stable]',
              FLOOR,
              // `bg-brand/10` by default: for a grand total this is the number the
              // page exists to show, and §3 gives the accent to it.
              footerClassName ?? 'bg-brand/10'
            )}
          >
            <table className={table}>
              {cols}
              <tfoot>{footer}</tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The floor all three tables share, read from the `--table-min-w` the scroller
 * sets. It has to be on the DIVs and not only on the tables: a flex child
 * stretches to its container's width, so without it the three boxes stay as
 * narrow as the card while the tables inside them overflow — three independent
 * overflows instead of one scroll.
 *
 * Unset, `min-width` resolves to nothing and the rule is inert.
 */
const FLOOR = 'min-w-(--table-min-w)';

/**
 * Column dividers, set on the table rather than on every cell so they land on
 * the group and total rows too — those span several columns and would otherwise
 * have to opt in by hand. `:not(:last-child)` keeps the right-hand edge clear:
 * the card's own border is already there, and a second line beside it reads as
 * a seam.
 *
 * Same declaration as `components/ui/data-table.tsx`, deliberately — the two
 * have to agree until the lists move onto this component.
 */
const DIVIDERS = cn(
  '[&_td:not(:last-child)]:border-r [&_th:not(:last-child)]:border-r',
  '[&_td]:border-border/60 [&_th]:border-border/60'
);

export function TableBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />;
}

const ROW = {
  /** An ordinary record. */
  default: '',
  /**
   * A heading inside the body — «Розділ 3», a кафедра, a year.
   *
   * **A brand tint, not `--muted`** (owner, 2026-09-08). Grey was the honest
   * neutral choice and it was also exactly what the table looked like before
   * Аврора, so the one band on the screen carrying structure said nothing about
   * the design it belongs to.
   *
   * It sits a step BELOW the total's `bg-brand/10`, which gives the two a
   * hierarchy instead of a competition: a section heading is a divider, the
   * total is the answer. Same hue, so they read as one system.
   *
   * Sticky to the top of the scroll box, and opaque — a translucent fill would
   * let the rows scroll through it, so the tint is composited into a solid in
   * `globals.css` rather than being an alpha. On the CELLS, because Chrome does
   * not honour `position: sticky` on a `<tr>`.
   */
  group: cn(
    'font-semibold',
    '[&>td]:sticky [&>td]:top-0 [&>td]:z-10 [&>td]:bg-table-group',
    // A rule on BOTH edges, not just the bottom. While one section's heading
    // is being pushed out by the next one's arrival the two are touching, and a
    // bottom-only rule lands exactly where the next heading's top edge is — so
    // the pair read as one two-line band with nothing between them (owner,
    // 2026-09-08).
    //
    // Insets rather than borders, because a collapsed border is left behind the
    // moment the cell sticks; see note 5.
    '[&>td]:shadow-[inset_0_1px_0_var(--border),inset_0_-1px_0_var(--border)]'
  ),
  /**
   * The line everything above adds up to.
   *
   * Weight only — the TINT lives on the footer strip that holds it. A cell
   * background stops at the table's edge, and the strip is a scrollbar's width
   * wider than that, so tinting the row left a white band down the right-hand
   * end of the total (owner, 2026-09-08). The strip is the thing that spans the
   * whole card, so the strip is what carries the colour.
   */
  total: 'font-bold',
} as const;

export function TableRow({
  className,
  variant = 'default',
  hoverable = false,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement> & {
  variant?: keyof typeof ROW;
  /** Light up under the cursor. For a row that is a link — see note 4 above. */
  hoverable?: boolean;
}) {
  return (
    <tr
      className={cn(
        'border-b border-border/60 transition-colors',
        ROW[variant],
        hoverable && 'hover:bg-muted/50',
        className
      )}
      {...props}
    />
  );
}

const ALIGN = { left: 'text-left', center: 'text-center', right: 'text-right' } as const;

export function TableHead({
  className,
  numeric = false,
  align,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement> & {
  /** Right-aligned, for a column of figures. */
  numeric?: boolean;
  /** Overrides whatever `numeric` chose. */
  align?: keyof typeof ALIGN;
}) {
  return (
    <th
      className={cn(
        // `--foreground` at `text-xs`, not `--muted-foreground` at 11px (owner,
        // 2026-09-08). A column heading is read once and then used as a landmark
        // for sixty rows, so it earns full contrast; §4's micro-label is for a
        // caption that should recede.
        //
        // **`text-foreground` is written out** (2026-09-11). It used to be
        // inherited, and the comment above was the only record that it was
        // deliberate — so the moment the page default became
        // `--foreground-soft`, every column heading in the app quietly lost the
        // contrast this paragraph claims it has. An intention that lives only in
        // a comment is not expressed.
        'h-11 px-4 text-left align-middle text-xs font-semibold tracking-wider text-foreground uppercase',
        numeric && 'text-right',
        align && ALIGN[align],
        className
      )}
      {...props}
    />
  );
}

export function TableCell({
  className,
  numeric = false,
  muted = false,
  align,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & {
  /** Right-aligned and `tabular-nums`, so figures line up down the column. */
  numeric?: boolean;
  /**
   * An INDEX or a reference, not content — a row number, an id, a source.
   * Paints `--muted-foreground`, which §4 of `docs/aurora.md` reserves for what
   * is glanced at rather than read.
   *
   * **Not for a secondary value.** A cell holding data somebody reads to tell
   * one row from another wants `text-foreground-soft` instead: `claims-table`
   * used `muted` for a programme name and a degree, and at 5.51 against the
   * name's 19.8 they read as switched off.
   */
  muted?: boolean;
  /**
   * Overrides whatever `numeric` chose, while keeping its `tabular-nums`.
   *
   * Centred figures do not line up their digits the way right-aligned ones do —
   * that is the trade, and it is worth making only where the column is narrow
   * enough that the difference is a couple of characters.
   */
  align?: keyof typeof ALIGN;
}) {
  return (
    <td
      className={cn(
        // `align-top`: a row here is often two or three lines — a label with a
        // summary under it — and a number vertically centred against that sits
        // beside nothing in particular. Aligned to the top it lines up with the
        // thing it is the score for.
        'px-4 py-2.5 align-top',
        numeric && 'text-right tabular-nums',
        align && ALIGN[align],
        muted && 'text-muted-foreground',
        className
      )}
      {...props}
    />
  );
}

/**
 * A column heading that sorts.
 *
 * `TableHead` with a link and a chevron in it. It replaces
 * `components/ui/sort-th.tsx`, which drew its label in `--muted-foreground` —
 * §4 of `docs/aurora.md` says a column heading is ink, because it is read once
 * and then used as a landmark for sixty rows.
 *
 * **Here because there were two of it.** `department-plans-table.tsx` grew one
 * privately in September and `/staff` wrote the same thing again three weeks
 * later, which is §11's «three cards in one day» starting over. It takes a
 * finished `href` rather than a params object, so the two callers keep their
 * own very different URL builders — `planListHref` on one side, the staff
 * list's `buildHref` on the other — and share the only part that was ever the
 * same: the drawing.
 *
 * `aria-sort` goes on the `<th>`, which is where ARIA defines it. On the link
 * it is ignored: `aria-sort` is only meaningful on a header cell.
 */
export function SortHead({
  label,
  href,
  active,
  dir,
  numeric = false,
  align,
  className,
}: {
  label: string;
  href: string;
  active: boolean;
  /** The direction the column is sorted in NOW — the chevron. `href` carries the next one. */
  dir: 'asc' | 'desc';
  numeric?: boolean;
  align?: keyof typeof ALIGN;
  className?: string;
}) {
  return (
    <TableHead
      numeric={numeric}
      align={align}
      className={className}
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}
    >
      <Link
        href={href}
        className={cn(
          'inline-flex items-center gap-1 transition-colors hover:text-brand',
          // The chevron follows the label to whichever edge the column is read
          // from, so it never sits between the heading and its own figures.
          (numeric || align === 'right') && 'flex-row-reverse'
        )}
      >
        {label}
        {active ? (
          dir === 'asc' ? (
            <ChevronUp className="size-3.5" />
          ) : (
            <ChevronDown className="size-3.5" />
          )
        ) : (
          // Present but faint on every sortable column: a chevron that appears
          // only on hover tells nobody with a touch screen that the column
          // sorts at all.
          <ChevronsUpDown className="size-3.5 opacity-40" />
        )}
      </Link>
    </TableHead>
  );
}
