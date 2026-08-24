import { cn } from '@/lib/utils';
import { sumScores } from '@/lib/round';
import type { AchievementGroup } from '@/components/rating/achievements-list';

const STATUS_STYLES = {
  APPROVED: 'bg-primary/10 text-primary',
  PENDING: 'bg-muted text-muted-foreground',
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

const cell = 'border border-border px-3 py-2';

/**
 * Full read-only rating table, spreadsheet-style: one bordered grid with
 * section header rows, item rows, section subtotals and a grand total.
 * `groups` should include every section (even empty ones) for the complete picture.
 */
export function RatingTable({ groups }: { groups: AchievementGroup[] }) {
  const grandTotal = sumScores(groups.map(sectionTotal));

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-muted/60 text-left">
            <th className={cn(cell, 'w-16 font-medium text-muted-foreground')}>№</th>
            <th className={cn(cell, 'font-medium text-muted-foreground')}>Показник</th>
            <th className={cn(cell, 'w-32 font-medium text-muted-foreground')}>Статус</th>
            <th className={cn(cell, 'w-20 text-right font-medium text-muted-foreground')}>Бали</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <SectionRows key={group.number} group={group} />
          ))}
          <tr className="bg-primary/10 font-bold">
            <td colSpan={3} className={cell}>
              Загальна сума балів
            </td>
            <td className={cn(cell, 'text-right text-base tabular-nums')}>{grandTotal}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function SectionRows({ group }: { group: AchievementGroup }) {
  const subtotal = sectionTotal(group);

  return (
    <>
      <tr className="bg-muted/40 font-semibold">
        <td colSpan={3} className={cell}>
          Розділ {group.number}. {group.title}
        </td>
        <td className={cn(cell, 'text-right tabular-nums')}>{subtotal}</td>
      </tr>

      {group.items.length === 0 ? (
        <tr>
          <td colSpan={4} className={cn(cell, 'text-muted-foreground')}>
            Немає досягнень
          </td>
        </tr>
      ) : (
        group.items.map((item) => (
          <tr
            key={item.id}
            className={cn(
              'transition-colors hover:bg-muted/20',
              item.isEmpty && 'text-muted-foreground'
            )}
          >
            <td className={cn(cell, 'align-top text-muted-foreground tabular-nums')}>
              {item.itemNumber}
            </td>
            {/* `wrap-anywhere`, not `break-words`. A DOI or a реєстраційний
                номер has no spaces, so with `auto` table layout the browser
                sizes this column to that unbreakable token and the whole table
                runs past 2 800px — you had to drag a scrollbar to read a row.
                `overflow-wrap: anywhere` is the one that also lowers the
                min-content width the layout algorithm uses, so the column can
                actually shrink (2026-08-24). */}
            <td className={cn(cell, 'align-top wrap-anywhere')}>
              <p>{item.label}</p>
              {item.summary && (
                <p className="mt-0.5 text-xs text-muted-foreground">{item.summary}</p>
              )}
              {item.status === 'REMOVED' && item.removeReason && (
                <p className="mt-1 text-xs text-destructive">
                  Причина відхилення: {item.removeReason}
                </p>
              )}
            </td>
            {/* One question for every row: where does this number come from.
                It used to be answered only on empty rows, so once «Зараховано»
                stopped being printed a filled row had an empty cell — «Науково-
                педагогічний стаж 26» with nothing beside it. Whether a row is
                filled has never been what this column is for; the score says
                that. Who to ask about it is the same on both. */}
            <td className={cn(cell, 'align-top')}>
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
            </td>
            <td
              className={cn(
                cell,
                'text-right align-top font-semibold tabular-nums',
                item.isEmpty && 'font-normal',
                !item.isEmpty &&
                  item.status !== 'APPROVED' &&
                  'font-normal text-muted-foreground line-through'
              )}
            >
              {item.score}
            </td>
          </tr>
        ))
      )}
    </>
  );
}
