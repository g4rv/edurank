import { cn } from '@/lib/utils';

/**
 * A pill that reports ONE condition.
 *
 * §3 of `docs/aurora.md` is what this exists to keep honest: chrome and data
 * are neutral, and a hue means something. A badge is the one place a colour is
 * allowed off the chart palette, because it encodes a state rather than a
 * category — and it is small, so a full row or panel never takes the tint.
 *
 * | tone          | means                                            |
 * | ------------- | ------------------------------------------------ |
 * | `brand`       | a classification, not a state — «НПП»            |
 * | `muted`       | nothing has happened yet — «На розгляді»          |
 * | `warn`        | pending, needs attention — «Не активовано»        |
 * | `ok`          | done, agreed, verified — «Підтверджено»           |
 * | `destructive` | refused or removed — «Відхилено»                  |
 *
 * `brand` uses `--brand-strong`, not `--brand`: §3 measured `--brand` on
 * `bg-brand/10` at 4.24:1, under AA, because the tint lifts the background
 * toward the text.
 *
 * ## Why it lives here now
 *
 * It was private to `identity-band.tsx`, which was right while it had one
 * caller — §11: «one caller means it is not shared yet». The claims table on
 * «Мої залучені здобувачі» is the second, so it moves, and the first caller is
 * repointed in the same commit. Moving it alone is how three `Card`s happened.
 *
 * **Seven more pills are still hand-written** — `staff-table`, `rating-table`,
 * `kharakterystyka-table`, `account-card`, `moderation-list`,
 * `achievements-list`, `distribution-grid`, `department-pools`. They are not
 * converted here on purpose: rewriting nine screens is a different job from
 * redesigning one, and each is easiest to check while that screen is being
 * redrawn. This is where they land as that happens.
 */
export function Badge({
  tone,
  className,
  children,
}: {
  tone: 'brand' | 'muted' | 'warn' | 'ok' | 'destructive';
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        tone === 'brand' && 'bg-brand/10 text-brand-strong',
        tone === 'muted' && 'bg-muted text-muted-foreground',
        tone === 'warn' && 'bg-amber-500/12 text-amber-700 dark:text-amber-400',
        tone === 'ok' && 'bg-green-500/12 text-green-700 dark:text-green-400',
        tone === 'destructive' && 'bg-destructive/10 text-destructive',
        className
      )}
    >
      {children}
    </span>
  );
}
