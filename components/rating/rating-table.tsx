import { cn } from '@/lib/utils';
import { sumScores } from '@/lib/round';
import type { AchievementGroup } from '@/components/rating/achievements-list';
import { EmptyRowsScope } from '@/components/rating/rating-view';
import { Table, TableBody, TableCell, TableHead, TableRow } from '@/components/aurora/ui/table';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Declared once and shared by the header, the rows and the footer — see the note
 * in `table.tsx` — and by `RatingTable.Shell`, so the loading state is the same
 * width as the table.
 *
 * «Показник» absorbs the slack, so a long title wraps instead of squeezing the
 * figures. «Бали» is 6 characters plus the cell's own `px-4`: the widest score
 * the university awards is five digits, so the column is as narrow as it can be
 * without ever wrapping a figure.
 */
const RATING_COLUMNS = ['calc(4ch + 2.5rem)', null, '11rem', 'calc(6ch + 2.5rem)'];

/** Static, so the shell prints it rather than drawing four grey bars. */
const RATING_HEAD = (
  <TableRow>
    <TableHead align="center">№</TableHead>
    <TableHead>Показник</TableHead>
    <TableHead align="center">Джерело</TableHead>
    <TableHead numeric align="center">
      Бали
    </TableHead>
  </TableRow>
);

/**
 * Only REMOVED is ever drawn today. The pill is suppressed for APPROVED (which
 * is nearly every row, and said nothing), and PENDING is never written at all —
 * a submission counts on save; see «There is no approval queue» in CLAUDE.md.
 *
 * The other two keep entries so the map stays total over the union, and they
 * are correct rather than stale: `--primary` is `oklch(0.205 0 0)`, so
 * `bg-primary/10` was a GREY tint, which §3 rules out.
 */
const STATUS_STYLES = {
  APPROVED: 'bg-brand/10 text-brand-strong',
  PENDING: 'bg-amber-500/10 text-amber-700 dark:text-amber-500',
  REMOVED: 'bg-destructive/10 text-destructive',
} as const;

/**
 * Who fills an indicator in.
 *
 * A division-managed row names the DIVISION rather than saying «відділ»: an
 * НПП who sees a wrong number, or none, can do exactly one useful thing about
 * it — ask the people who enter it — and the generic word did not tell them
 * who those people are.
 *
 * Worded for both readers. This table is the НПП's own rating AND what an
 * editor opens on /staff/[id]/rating, so the second person was addressing the
 * wrong one half the time: an editor reading «Подаєте самостійно» about
 * somebody else's row is being told they submit it.
 */
function whoFills(row: { inputSource?: string; division?: string | null }): string {
  switch (row.inputSource) {
    case 'NPP_SUBMISSION':
      return 'Самостійне подання';
    case 'PROFILE_DERIVED':
      return 'З профілю';
    case 'DIVISION_MANAGED':
      // The name alone. In a column that answers «звідки це число» the verb was
      // repeated on every division row and carried nothing the heading and the
      // other two values did not already imply.
      return row.division ?? 'Відділ';
    default:
      return '—';
  }
}

/**
 * Only APPROVED items count toward totals.
 *
 * Rounded here, not only in the database. These subtotals are added up fresh on
 * every render, so the stored-value fix never reached them — «404,17 + 480»
 * printed as 884,1700000000001 in the Розділ 2 row.
 */
function sectionTotal(group: AchievementGroup): number {
  return sumScores(group.items.filter((i) => i.status === 'APPROVED').map((i) => i.score));
}

/**
 * Full read-only rating table — every section, its indicators, its subtotal,
 * and the year's grand total at the foot.
 *
 * `groups` should carry every section, empty ones included: an editor has to be
 * able to tell «this person has nothing under 3.7» from «3.7 does not exist»,
 * and if the two readers of one rating see different tables the number stops
 * meaning anything.
 *
 * Built on «Аврора»'s `Table` since 2026-09-08. It was a hand-rolled grid with
 * `border border-border` on every cell, which made each row four boxed
 * compartments and the page a spreadsheet. Only the surface changed; the
 * columns, the arithmetic and the wording are as they were.
 */
export function RatingTable({
  groups,
  fill = false,
}: {
  groups: AchievementGroup[];
  /**
   * Take the height the layout has left rather than a guessed cap. Needs every
   * ancestor up to a bounded one to be a flex column — see `Table`'s own note.
   * Only the rehearsal is wired that way so far; `/achievements` and
   * `/staff/[id]/rating` follow when their layouts do.
   */
  fill?: boolean;
}) {
  const grandTotal = sumScores(groups.map(sectionTotal));
  const emptyCount = groups.reduce((n, g) => n + g.items.filter((i) => i.isEmpty).length, 0);

  return (
    <EmptyRowsScope count={emptyCount} fill={fill}>
      <Table
        fill={fill}
        // Declared once and shared by the header, the rows and the footer — see
        // the note in `table.tsx`. «Показник» is the column that absorbs the
        // slack, so a long title wraps instead of squeezing the figures.
        // «Бали» is 6 characters wide plus the cell's own `px-4` either side —
        // the widest score the university awards is five digits, so the column
        // is as narrow as it can be without ever wrapping a figure.
        columns={RATING_COLUMNS}
        head={RATING_HEAD}
        // Pinned below the rows rather than scrolled to. The year's total is the
        // one number somebody opens this page for, and it was at the bottom of
        // sixty-seven rows.
        footer={
          <TableRow variant="total">
            <TableCell colSpan={3}>Загальна сума балів</TableCell>
            <TableCell numeric align="center" className="text-base">
              {grandTotal}
            </TableCell>
          </TableRow>
        }
      >
        {/* One `<tbody>` PER SECTION, not one around all five. That is what
            makes the sticky headings stack: a sticky cell cannot leave its own
            sectioning box, so Розділ 1's heading is carried away by the end of
            Розділ 1 just as Розділ 2's arrives at the top of the scroll box.
            Several `<tbody>` elements in one table is valid HTML and is exactly
            what they are for. */}
        {groups.map((group) => (
          <SectionRows key={group.number} group={group} />
        ))}
      </Table>
    </EmptyRowsScope>
  );
}

function SectionRows({ group }: { group: AchievementGroup }) {
  const subtotal = sectionTotal(group);

  return (
    <TableBody>
      <TableRow variant="group">
        <TableCell colSpan={3}>
          Розділ {group.number}. {group.title}
        </TableCell>
        <TableCell numeric align="center">
          {subtotal}
        </TableCell>
      </TableRow>

      {group.items.length === 0 ? (
        <TableRow>
          <TableCell colSpan={4} muted>
            Немає досягнень
          </TableCell>
        </TableRow>
      ) : (
        group.items.map((item) => (
          <TableRow
            key={item.id}
            // Read by `EmptyRowsToggle`, which hides these with CSS rather than
            // filtering them out — that is what keeps this table a server
            // component. Only ever `true`: `data-empty={false}` would still
            // write the attribute, and `tr[data-empty=true]` would then be the
            // only selector that works while `[data-empty]` quietly matched
            // every row.
            data-empty={item.isEmpty ? true : undefined}
            className={cn(item.isEmpty && 'text-muted-foreground')}
          >
            <TableCell muted align="center" className="tabular-nums">
              {item.itemNumber}
            </TableCell>

            {/* `wrap-anywhere`, not `break-words`. A DOI or a реєстраційний
                номер has no spaces, so with `auto` table layout the browser
                sizes this column to that unbreakable token and the whole table
                runs past 2 800px — you had to drag a scrollbar to read a row.
                `overflow-wrap: anywhere` is the one that also lowers the
                min-content width the layout algorithm uses, so the column can
                actually shrink (2026-08-24). */}
            <TableCell className="wrap-anywhere">
              <p>{item.label}</p>
              {item.summary && (
                <p className="mt-0.5 text-xs text-muted-foreground">{item.summary}</p>
              )}
              {item.status === 'REMOVED' && item.removeReason && (
                <p className="mt-1 text-xs text-destructive">
                  Причина відхилення: {item.removeReason}
                </p>
              )}
            </TableCell>

            {/* One question for every row: where does this number come from.
                It used to be answered only on empty rows, so once «Зараховано»
                stopped being printed a filled row had an empty cell — «Науково-
                педагогічний стаж 26» with nothing beside it. Whether a row is
                filled has never been what this column is for; the score says
                that. Who to ask about it is the same on both. */}
            <TableCell align="center">
              {/* Only a state worth reacting to. «Зараховано» sat on nearly
                  every row, told the reader nothing, and buried the rare
                  «Відхилено» among identical pills. /moderation keeps the full
                  set — filtering by state is that page's job. */}
              {item.status !== 'APPROVED' && (
                <span
                  className={cn(
                    'mb-0.5 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
                    STATUS_STYLES[item.status]
                  )}
                >
                  {item.statusLabel}
                </span>
              )}
              {/* Wraps. It used to be `whitespace-nowrap`, which forced a
                  publication title or a тема's full name onto one line and
                  stretched the whole table past 2 800px — the box scrolls, so
                  nothing overflowed the page, but reading a row meant dragging
                  a scrollbar (2026-08-24). The status pill above keeps its own
                  nowrap: it is three words and breaking it looks broken. */}
              <span className="block text-xs wrap-anywhere text-muted-foreground">
                {whoFills(item)}
              </span>
            </TableCell>

            <TableCell
              numeric
              align="center"
              className={cn(
                'font-semibold',
                item.isEmpty && 'font-normal',
                !item.isEmpty &&
                  item.status !== 'APPROVED' &&
                  'font-normal text-muted-foreground line-through'
              )}
            >
              {item.score}
            </TableCell>
          </TableRow>
        ))
      )}
    </TableBody>
  );
}

/**
 * The table with its real head and footer, and a shimmer per cell.
 *
 * **The columns, the headings and «Загальна сума балів» are static**, so they
 * are printed rather than approximated — the same `Table`, the same `columns`
 * array, so the shell cannot be a different width from the thing it stands for.
 * Only the rows are unknown.
 *
 * `fill`, as the real one is: the card takes the height that is left, so the
 * row count decides nothing and the rows simply overflow and clip.
 */
RatingTable.Shell = function RatingTableShell() {
  return (
    <Table
      fill
      columns={RATING_COLUMNS}
      head={RATING_HEAD}
      footer={
        <TableRow variant="total">
          <TableCell colSpan={3}>Загальна сума балів</TableCell>
          {/* `h-6`, matching `text-base`'s 24px line. At `h-5` the footer was
              20px tall while it loaded and 24px once the total arrived, so the
              row grew by four pixels at the very end of the load. */}
          <TableCell numeric align="center" className="text-base">
            <Skeleton className="ml-auto h-6 w-12" />
          </TableCell>
        </TableRow>
      }
    >
      <TableBody>
        {Array.from({ length: 14 }).map((_, i) => (
          <TableRow key={i}>
            <TableCell align="center">
              <Skeleton className="mx-auto h-4 w-6" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-4 w-2/3" />
            </TableCell>
            <TableCell align="center">
              <Skeleton className="mx-auto h-3 w-24" />
            </TableCell>
            <TableCell numeric align="center">
              <Skeleton className="ml-auto h-4 w-6" />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};
