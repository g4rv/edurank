import { Check, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { REQUIRED_POSITIONS } from '@/lib/kharakterystyka/positions';
import type { Kharakterystyka, KharakterystykaPosition } from '@/lib/kharakterystyka/build';

// The printed document is a three-column table — № з/п, Показник активності,
// Дані підтвердження показника — and this keeps that shape, because the point of
// the page is to replace the one being typed by hand. The extra status column is
// screen-only: on paper an empty evidence cell says «not met» by itself, but on
// screen the reader wants to know whether it is empty because nothing qualifies
// or because nobody has typed it.

const cell = 'border border-border px-3 py-2 align-top';

export function KharakterystykaTable({ data }: { data: Kharakterystyka }) {
  return (
    <div className="space-y-4">
      <Summary data={data} />

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted/60 text-left">
              <th className={cn(cell, 'w-14 font-medium text-muted-foreground')}>№</th>
              <th className={cn(cell, 'font-medium text-muted-foreground')}>Показник активності</th>
              <th className={cn(cell, 'w-[45%] font-medium text-muted-foreground')}>
                Дані підтвердження показника
              </th>
              <th className={cn(cell, 'w-28 font-medium text-muted-foreground')}>Стан</th>
            </tr>
          </thead>
          <tbody>
            {data.positions.map((position) => (
              <PositionRow key={position.number} position={position} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Summary({ data }: { data: Kharakterystyka }) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-xl border px-4 py-3',
        // Green for «meets the licence bar», amber for «does not yet» — the
        // narrow status-indicator exception to the monochrome rule, and this is
        // one condition rather than a category.
        data.qualifies
          ? 'border-emerald-600/30 bg-emerald-600/5'
          : 'border-amber-600/30 bg-amber-600/5'
      )}
    >
      <span className="text-lg font-semibold tabular-nums">
        {data.metCount} з {data.positions.length}
      </span>
      <span className="text-sm text-muted-foreground">
        позицій за {data.from}–{data.to} рр.
      </span>
      <span
        className={cn(
          'ml-auto text-sm font-medium',
          data.qualifies
            ? 'text-emerald-700 dark:text-emerald-400'
            : 'text-amber-700 dark:text-amber-500'
        )}
      >
        {data.qualifies
          ? `Відповідає (потрібно ${REQUIRED_POSITIONS})`
          : `Потрібно щонайменше ${REQUIRED_POSITIONS}`}
      </span>
    </div>
  );
}

function PositionRow({ position }: { position: KharakterystykaPosition }) {
  // A military position is not a gap in this person's record — it belongs to a
  // different kind of institution — so it is dimmed rather than flagged.
  const inapplicable = position.fill === 'NOT_APPLICABLE';

  return (
    <tr className={cn('transition-colors hover:bg-muted/20', inapplicable && 'opacity-55')}>
      <td className={cn(cell, 'text-muted-foreground tabular-nums')}>{position.number}</td>

      <td className={cell}>
        <p>{position.title}</p>
        {position.note && <p className="mt-1 text-xs text-muted-foreground">{position.note}</p>}
      </td>

      <td className={cell}>
        {position.entries.length === 0 ? (
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
      </td>

      <td className={cell}>
        <Status position={position} />
      </td>
    </tr>
  );
}

function Status({ position }: { position: KharakterystykaPosition }) {
  if (position.met) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600/10 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-emerald-700 dark:text-emerald-400">
        <Check className="size-3" />
        Виконано
      </span>
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
