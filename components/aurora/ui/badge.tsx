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
 * **Every tone is a token pair, never a Tailwind palette class** (2026-09-11).
 * Each is `--x-surface` for the fill and `--x` for the text, measured together:
 * 4.55 for `ok`, 4.87 for `warn`, 5.15 for `destructive`. Until then this file
 * wrote `bg-amber-500/12 text-amber-700 dark:text-amber-400` — one of twelve
 * amber recipes in the app, each invented where it was needed because there was
 * nothing to point at. The tokens carry their own dark values, so no tone needs
 * a `dark:` variant any more.
 *
 * Two tones take the `-strong` half of their pair, for one measured reason: a
 * tint LIFTS the background toward the text, so the plain value lands under AA
 * on its own fill. `--brand` on `bg-brand/10` measures 4.24 (§3) and `--error`
 * on `--error-surface` measures 3.98; `--brand-strong` and `--error-strong` read
 * 6.76 and 5.15 there. `ok` and `warn` are dark enough already and have no twin.
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
        tone === 'warn' && 'bg-warning-surface text-warning',
        tone === 'ok' && 'bg-success-surface text-success',
        tone === 'destructive' && 'bg-error-surface text-error-strong',
        className
      )}
    >
      {children}
    </span>
  );
}
