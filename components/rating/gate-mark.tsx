import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * In place of a score on an indicator that opens the rating — 5.1 (owner,
 * 2026-10-16). It scores nothing for anybody, lecturer or not, so a «0» there
 * would read as a failure. A status, so it carries the status tokens (§3 of
 * docs/aurora.md): `--success` once filled, `--warning` while it is not.
 */
export function GateMark({
  done,
  compact = false,
  className,
}: {
  done: boolean;
  /**
   * For a column sized to a number (the rating table's «Бали», six characters):
   * the tick above a smaller word, which then wraps instead of being cut off.
   */
  compact?: boolean;
  className?: string;
}) {
  return done ? (
    <span
      className={cn(
        'inline-flex items-center font-medium text-success',
        compact ? 'flex-col gap-0.5 text-xs' : 'gap-1',
        className
      )}
    >
      <Check className="size-4" aria-hidden />
      Виконано
    </span>
  ) : (
    <span className={cn('font-medium text-warning', compact && 'text-xs leading-tight', className)}>
      Не заповнено
    </span>
  );
}

type GateRow = { gating?: boolean; isEmpty?: boolean; status: string };

/** A row of such an indicator is «done» when the person has a counted entry */
export function rowDone(item: GateRow): boolean {
  return !!item.gating && !item.isEmpty && item.status === 'APPROVED';
}

/** A section made only of such indicators has no number to add up */
export function allGating(items: readonly GateRow[]): boolean {
  return items.length > 0 && items.every((i) => i.gating);
}
