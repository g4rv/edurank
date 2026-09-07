import Link from 'next/link';
import { cn } from '@/lib/utils';

/**
 * Where you are, as «Аврора» draws it — «Кафедри › Вищої математики».
 *
 * Replaces the `ChevronLeft` back-links dotted around the app. Those answered
 * «how do I go back», which the browser already answers; this answers «where am
 * I», which nothing did. On a system where one person is routinely an ADMIN, an
 * НПП and a завідувач at once, and the same record is reachable from three
 * different lists, that is the more useful question.
 *
 * **A crumb without an `href` is an ancestor that is not a page.** The sidebar
 * groups — «Особисте», «Управління», «Адміністрування» — are the app's real
 * information architecture but have no route of their own, and inventing one
 * would be a lie. They render as plain text.
 *
 * Semantics matter more than usual here: `<nav>` + `<ol>` + `aria-current` is
 * what lets a screen reader announce this as a trail and say which entry is the
 * current page, rather than reading out a row of links and chevrons.
 */

export interface Crumb {
  label: string;
  /** Omit for an ancestor with no page of its own, or for the current page */
  href?: string;
}

export function Breadcrumbs({ items, className }: { items: Crumb[]; className?: string }) {
  if (items.length === 0) return null;

  return (
    <nav aria-label="Навігація сторінками" className={className}>
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`} className="flex items-center gap-x-1.5">
              {i > 0 && (
                <svg
                  aria-hidden
                  viewBox="0 0 16 16"
                  className="size-3.5 shrink-0 text-muted-foreground/60"
                  fill="none"
                >
                  <path
                    d="M6 4l4 4-4 4"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              )}

              {last ? (
                // No link to the page you are already on — it reads as an
                // action and does nothing.
                <span aria-current="page" className="font-medium text-foreground">
                  {item.label}
                </span>
              ) : item.href ? (
                // Ink, not grey, and underlined (owner, 2026-09-07). At
                // `--muted-foreground` over the wash the trail all but
                // disappeared — and a breadcrumb is the one piece of chrome
                // somebody looks for when they are lost, which is exactly when
                // faint is wrong. The underline is what still says «link»
                // once the colour no longer does; §3 keeps `--brand` for the
                // hover so it is not spent on every crumb on every page.
                <Link
                  href={item.href}
                  className="text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors hover:text-brand hover:decoration-brand/50"
                >
                  {item.label}
                </Link>
              ) : (
                <span className={cn('text-muted-foreground')}>{item.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
