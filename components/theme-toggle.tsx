'use client';

import { flushSync } from 'react-dom';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Which icon shows is left to CSS, not to React state: next-themes puts the
// class on <html> before paint, so the server markup and the first client
// render agree and the icon never flips after hydration. The icon shows what
// the click will give you, not what is on now.

/** Fallback fade, for browsers with no View Transitions. Matches the duration
 *  in `.theme-transition`, plus slack so the class outlives the fade. */
const FADE_MS = 320;

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();

  /**
   * Switch the theme without anything on screen snapping.
   *
   * **Cross-fade the rendered frame, do not transition properties.** The first
   * attempt at this put a `transition` on background/border/colour/fill during
   * the switch, and it half-worked: surfaces faded, but icons flipped instantly.
   * Sampling a button frame by frame showed why — its `color` went from
   * `oklab(0.145…)` straight to `lab(98.26)` in a single frame with no
   * intermediate values, because the change arrives through a custom property
   * on `:root` and is inherited rather than set on the element. Chasing
   * individual properties cannot fix that; every icon in the app inherits its
   * colour the same way.
   *
   * `startViewTransition` sidesteps the whole question by fading a snapshot of
   * the old frame into the new one, so nothing can be missed — icons, borders,
   * shadows and the wash all cross-fade together.
   *
   * `flushSync` is required: the callback has to leave the DOM in its final
   * state synchronously, and `setTheme` would otherwise land in a later React
   * render, after the snapshot has already been taken.
   */
  function switchTheme() {
    const next = resolvedTheme === 'dark' ? 'light' : 'dark';

    // A theme change is a large full-screen shift — exactly what this setting
    // is for. Switch instantly instead.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setTheme(next);
      return;
    }

    if (!document.startViewTransition) {
      // Firefox before 129, Safari before 18. The property-level fade is
      // partial — icons will still snap — but it is better than nothing and
      // costs one class.
      const root = document.documentElement;
      root.classList.add('theme-transition');
      window.setTimeout(() => root.classList.remove('theme-transition'), FADE_MS);
      setTheme(next);
      return;
    }

    document.startViewTransition(() => {
      flushSync(() => setTheme(next));
    });
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn('size-8 text-muted-foreground hover:text-foreground', className)}
      onClick={switchTheme}
      aria-label="Змінити тему"
      title="Змінити тему"
    >
      {/* Stacked and cross-faded rather than swapped with `hidden`/`dark:block`:
          `display` cannot be animated by either mechanism, so the old pair
          snapped at the instant the class landed — and directly under the
          cursor at the moment of the click, which made it the most conspicuous
          thing on screen. */}
      <span className="relative inline-flex size-4 shrink-0">
        <Moon className="absolute inset-0 size-4 opacity-100 dark:opacity-0" />
        <Sun className="absolute inset-0 size-4 opacity-0 dark:opacity-100" />
      </span>
    </Button>
  );
}
