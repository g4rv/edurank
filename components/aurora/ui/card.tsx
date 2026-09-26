import { cn } from '@/lib/utils';

/**
 * The card surface — one definition, to be worn everywhere.
 *
 * `rounded-xl border bg-card` is written out in **82 files**, and by the time
 * it was counted there were already three versions of the same idea: this
 * surface inline, `InfoCard` in the profile, and `SectionCard` in the staff
 * form. Adding `shadow-card` meant editing all of them, which is why five have
 * a shadow and seventy-seven do not.
 *
 * `InfoCard` and `SectionCard` are **now gone**, folded into this one — see
 * §11 of `docs/aurora.md` for why they existed at all, which is the more useful
 * half of the story. What they turned out to be:
 *
 * - `SectionCard` was this plus `relative overflow-hidden`, which clipped
 *   nothing — no descendant of it was ever absolutely positioned — and a step
 *   number in the `action` slot. It survives as `<Card action={<StepNumber />}>`.
 * - `InfoCard` was this plus the profile's `<dl>`. The list was the real
 *   difference and it stays, as `Fields` in `staff/profile/primitives.tsx`,
 *   next to the `Field` rows it holds. It is one screen's list, not a surface.
 *
 * Three shapes cover every existing use:
 *
 * - `<Card>` — the ordinary one, `p-5`
 * - `<Card padding="none">` — a table or list that manages its own padding
 * - `<EmptyState>` — the centred «nothing here» panel, which appears 26 times
 */

const PADDING = {
  default: 'p-5',
  compact: 'px-5 py-4',
  none: '',
} as const;

export function Card({
  padding = 'default',
  title,
  action,
  className,
  children,
}: {
  padding?: keyof typeof PADDING;
  /** Uppercase heading. Omit for a card that is only a container. */
  title?: string;
  /**
   * Sits opposite the title — a link, a count, a step number, a small control.
   *
   * One slot, because the three cards this replaced each had their own name for
   * it (`trailing`, `step`, `action`) and drew it in the same place.
   */
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('rounded-xl border bg-card shadow-card', PADDING[padding], className)}>
      {title && (
        // `items-baseline`, not `items-center`. What goes opposite the title is
        // usually type — the ставка total, the `01` step — and type that misses
        // the heading's baseline is visible at a glance. A control put here is
        // aligned on its own label's baseline instead, which is off by a pixel
        // or two and is not.
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <CardTitle>{title}</CardTitle>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

/** Standalone, for a card whose heading needs more than a string. */
export function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-semibold tracking-wide text-foreground uppercase">{children}</h2>
  );
}

/**
 * «There is nothing here» — a card with one sentence in the middle of it.
 *
 * Its own component rather than a `Card` prop because the padding is unusual
 * (`py-12`, far more than a card with content), and it is always centred and
 * muted. Written out, those three decisions drifted across 26 copies.
 */
export function EmptyState({
  children,
  className,
  action,
}: {
  children: React.ReactNode;
  className?: string;
  /** An offer to fix the emptiness — «Додати», «Скинути фільтри» */
  action?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border bg-card px-6 py-12 text-center text-sm text-muted-foreground shadow-card',
        className
      )}
    >
      {children}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

/**
 * A panel that floats over a card — a select menu, a combobox list, a date
 * picker popover.
 *
 * Same surface, `--shadow-float` instead of `--shadow-card`: a card shadow is
 * tuned to lift a card off the page, and over another card it vanishes, because
 * the two surfaces are the same colour and the shadow has nothing to fall on.
 *
 * `overflow-hidden` so a list's first and last rows are clipped by the rounded
 * corners rather than squaring them off.
 */
export function FloatingPanel({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('overflow-hidden rounded-xl border bg-card shadow-float', className)}>
      {children}
    </div>
  );
}
