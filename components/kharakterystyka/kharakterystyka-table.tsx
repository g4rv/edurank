import { Check, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableRow } from '@/components/aurora/ui/table';
import { REQUIRED_POSITIONS } from '@/lib/kharakterystyka/positions';
import type { Kharakterystyka, KharakterystykaPosition } from '@/lib/kharakterystyka/build';
import { ManualEntries, type ManualEntry } from './manual-entries';

// The printed document is a three-column table — № з/п, Показник активності,
// Дані підтвердження показника — and this keeps that shape, because the point of
// the page is to replace the one being typed by hand. The extra status column is
// screen-only: on paper an empty evidence cell says «not met» by itself, but on
// screen the reader wants to know whether it is empty because nothing qualifies
// or because nobody has typed it.

export function KharakterystykaTable({
  data,
  sources,
  editing,
  fill = false,
}: {
  data: Kharakterystyka;
  /** Position number → the indicators that count towards it, from the template */
  sources?: Record<number, { itemNumber: string; label: string }[]>;
  /**
   * Typing evidence by hand — ADMIN only, and absent everywhere else, so the
   * document stays read-only for the people who merely read it.
   */
  editing?: { staffId: string; entries: ManualEntry[] };
  /** Take the height the layout has left — see `Table`'s own note. */
  fill?: boolean;
}) {
  return (
    <Table
      // «Дані підтвердження» takes a share rather than the slack: both middle
      // columns are prose, and left to fight for the leftover width one of them
      // wins by however long this person's publication titles happen to be.
      columns={['calc(4ch + 2.5rem)', null, '42%', '9rem']}
      fill={fill}
      head={
        <TableRow>
          <TableHead align="center">№</TableHead>
          <TableHead>Показник активності</TableHead>
          <TableHead>Дані підтвердження показника</TableHead>
          <TableHead align="center">Стан</TableHead>
        </TableRow>
      }
    >
      <TableBody>
        {data.positions.map((position) => (
          <PositionRow
            key={position.number}
            position={position}
            sources={sources?.[position.number]}
            editing={editing}
            years={{ from: data.from, to: data.to }}
          />
        ))}
      </TableBody>
    </Table>
  );
}

/**
 * The pill both the Стан column and the summary's verdict wear.
 *
 * They were the same seven classes written twice, one of which had already
 * drifted — the summary's verdict was plain coloured text while the row's was a
 * tinted capsule, so the same fact looked like two different kinds of thing on
 * one screen (owner, 2026-09-08).
 *
 * Green means «meets it», amber «does not yet» — the narrow status-indicator
 * exception to the monochrome rule, and this is one condition rather than a
 * category.
 */
function Pill({
  tone,
  icon,
  children,
}: {
  tone: 'met' | 'short';
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        tone === 'met'
          ? 'bg-emerald-600/10 text-emerald-700 dark:text-emerald-400'
          : 'bg-amber-600/10 text-amber-700 dark:text-amber-500'
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/**
 * The verdict — «8 з 20 · Відповідає».
 *
 * Its own component rather than a row of the table (owner, 2026-09-08). It was
 * tried as the pinned footer, on the argument that it is what the twenty rows
 * add up to — but it is not a total the way the rating's is: it is a STATE, and
 * a state belongs with the other controls that say what you are looking at,
 * beside the tabs, not at the bottom of the thing it describes.
 *
 * **Neutral shell, coloured verdict** (owner, 2026-09-08). A whole green bar
 * shouts a status the reader is not being asked to act on; the one word that
 * carries the answer is enough, and §3 keeps hue for exactly that — one
 * condition, on the narrowest thing that can say it.
 *
 * Built the same way as the tab bar beside it — `p-1` around `h-8` content —
 * rather than given a height of its own. A fixed `h-10` came out a pixel short,
 * and a box that nearly matches reads worse than one that plainly does not;
 * sharing the construction means they cannot drift again.
 */
export function KharakterystykaSummary({ data }: { data: Kharakterystyka }) {
  return (
    <div className="rounded-lg border bg-card p-1 shadow-xs">
      <div className="flex h-8 items-center gap-2.5 px-2">
        <span className="text-sm font-semibold tabular-nums">
          {data.metCount} з {data.positions.length}
        </span>
        <span className="text-sm whitespace-nowrap text-muted-foreground">
          позицій · {data.from}–{data.to}
        </span>
        <Pill
          tone={data.qualifies ? 'met' : 'short'}
          icon={data.qualifies ? <Check className="size-3" /> : undefined}
        >
          {data.qualifies ? 'Відповідає' : `Потрібно ${REQUIRED_POSITIONS}`}
        </Pill>
      </div>
    </div>
  );
}

function dedupe(
  sources: { itemNumber: string; label: string }[]
): { itemNumber: string; label: string }[] {
  const byNumber = new Map<string, string[]>();
  for (const s of sources) {
    const labels = byNumber.get(s.itemNumber) ?? [];
    if (!labels.includes(s.label)) labels.push(s.label);
    byNumber.set(s.itemNumber, labels);
  }
  return [...byNumber].map(([itemNumber, labels]) => ({
    itemNumber,
    label: labels.join(' · '),
  }));
}

function PositionRow({
  position,
  sources,
  editing,
  years,
}: {
  position: KharakterystykaPosition;
  /** Indicators that count towards this position, from the year's template */
  sources?: { itemNumber: string; label: string }[];
  editing?: { staffId: string; entries: ManualEntry[] };
  /** The document's five-year window, so a typed row cannot fall outside it */
  years: { from: number; to: number };
}) {
  // A military position is not a gap in this person's record — it belongs to a
  // different kind of institution — so it is dimmed rather than flagged.
  const inapplicable = position.fill === 'NOT_APPLICABLE';
  // Everything but the military positions, which this university may not claim
  // at all — there is nothing to type there, so no control is offered.
  const canType = !!editing && !inapplicable;

  return (
    <TableRow className={cn(inapplicable && 'opacity-55')}>
      <TableCell muted align="center" className="tabular-nums">
        {position.number}
      </TableCell>

      <TableCell>
        <p>{position.title}</p>
        {position.note && <p className="mt-1 text-xs text-muted-foreground">{position.note}</p>}
        {/* Where this position takes its value from. Only the exceptions used to
            say anything — «з профілю», «вручну», «для військових ЗВО» — so the
            fourteen ordinary ones were silent, and «0 з 5» left somebody no way
            of knowing what would count (2026-08-17). Shown whether or not the
            position is met: it is most needed when the evidence column is a
            dash, which is exactly when there is nothing else to read. */}
        {position.fill === 'DERIVED' && sources && sources.length > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            Зараховуються показники:{' '}
            {dedupe(sources).map((s, i) => (
              <span key={s.itemNumber}>
                {i > 0 && ', '}
                <span className="tabular-nums" title={s.label}>
                  {s.itemNumber}
                </span>
              </span>
            ))}
          </p>
        )}
      </TableCell>

      <TableCell>
        {position.entries.length === 0 && !canType ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          <ul className="space-y-2">
            {position.entries.map((entry, i) => (
              <li key={`${entry.itemNumber}-${i}`} className="text-xs">
                <span className="text-muted-foreground tabular-nums">{entry.itemNumber}</span>{' '}
                <span className="whitespace-pre-line">{entry.summary}</span>{' '}
                <span className="text-muted-foreground">({entry.year})</span>
              </li>
            ))}
          </ul>
        )}
        {canType && editing && (
          <ManualEntries
            staffId={editing.staffId}
            position={position.number}
            entries={editing.entries.filter((e: ManualEntry) => e.position === position.number)}
            minYear={years.from}
            maxYear={years.to}
          />
        )}
      </TableCell>

      <TableCell align="center">
        <Status position={position} />
      </TableCell>
    </TableRow>
  );
}

function Status({ position }: { position: KharakterystykaPosition }) {
  if (position.met) {
    return (
      <Pill tone="met" icon={<Check className="size-3" />}>
        Виконано
      </Pill>
    );
  }

  if (position.fill === 'NOT_APPLICABLE') {
    return (
      <span className="inline-flex items-center gap-1 text-xs whitespace-nowrap text-muted-foreground">
        <Minus className="size-3" />
        Не застосовується
      </span>
    );
  }

  // A counter only where the bar is more than one — «4 з 5» tells somebody they
  // are one publication away, which «не виконано» never could.
  if (position.progress) {
    return (
      <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
        {position.progress.have} з {position.progress.need}
      </span>
    );
  }

  return <span className="text-xs whitespace-nowrap text-muted-foreground">Не виконано</span>;
}
