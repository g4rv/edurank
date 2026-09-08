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
  fill = false,
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
   */
  fill?: boolean;
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
        fill ? 'min-h-0 flex-1' : 'max-h-(--table-max-h) [--table-max-h:calc(100svh-16rem)]',
        containerClassName
      )}
    >
      {/* `overflow-hidden` makes this a scroll container, which is what lets
          `scrollbar-gutter` apply — it gives up the same strip the rows below
          do, so the columns line up. Nothing here ever actually scrolls. */}
      <div className="shrink-0 overflow-hidden border-b [scrollbar-gutter:stable]">
        <table className={table}>
          {cols}
          <thead>{head}</thead>
        </table>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        <table className={table}>
          {cols}
          {children}
        </table>
      </div>

      {footer && (
        // `bg-brand/10` here rather than on the row: this is the number the
        // page exists to show, §3 gives the accent to it, and only the strip
        // reaches across the scrollbar gutter.
        <div className="shrink-0 overflow-hidden border-t bg-brand/10 [scrollbar-gutter:stable]">
          <table className={table}>
            {cols}
            <tfoot>{footer}</tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

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
    '[&>td]:shadow-[inset_0_-1px_0_var(--border)]'
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
        'h-11 px-4 text-left align-middle text-xs font-semibold tracking-wider uppercase',
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
  /** A value that is present but secondary — an id, a source, a count. */
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
