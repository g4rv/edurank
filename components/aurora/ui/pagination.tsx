import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AuroraButton } from './button';
import { pageItems } from '@/components/ui/pagination';

/**
 * «Аврора»'s pager — a drop-in replacement for `components/ui/pagination`.
 *
 * **`pageItems` is imported, not copied.** Which page numbers collapse into an
 * ellipsis is logic with its own tests; a second copy here would be a second
 * thing to fix. Only the drawing changes.
 *
 * **Deliberately no `'use client'`, exactly as the original.** The two callers
 * need different mechanics — `/staff` is a Server Component and pages through
 * the URL, `/moderation` holds the page in client state — so this takes either
 * `hrefFor` (renders links) or `onPageChange` (renders buttons). Imported by a
 * server page it stays a server component; imported by a client one it is
 * compiled into that bundle and the handler works. Pass exactly one.
 *
 * The one visual change worth arguing about: **the current page is the brand
 * tint, not `secondary`.** `--secondary` is a grey barely off the page ground,
 * so on a row of grey ghost buttons the page you are actually on was the
 * hardest one to find. `docs/aurora.md` gives the accent to the active tab and
 * the active nav item, and this is the same fact about the same kind of row.
 */

type Props = {
  page: number;
  totalPages: number;
  /** Link mode — used by Server Components that page through the URL */
  hrefFor?: (page: number) => string;
  /** Button mode — used by client components holding the page in state */
  onPageChange?: (page: number) => void;
  /** Shown on the left, e.g. «204 записів» */
  summary?: React.ReactNode;
  className?: string;
};

export function AuroraPagination({
  page,
  totalPages,
  hrefFor,
  onPageChange,
  summary,
  className,
}: Props) {
  if (totalPages <= 1) return null;

  const items = pageItems(page, totalPages);

  return (
    <nav
      aria-label="Навігація сторінками"
      className={cn('flex flex-wrap items-center justify-between gap-3 text-sm', className)}
    >
      <span className="text-muted-foreground">
        {summary ?? (
          <>
            Стор. {page} з {totalPages}
          </>
        )}
      </span>

      <div className="flex items-center gap-1">
        <Step
          to={page - 1}
          disabled={page <= 1}
          label="Попередня"
          hrefFor={hrefFor}
          onPageChange={onPageChange}
        >
          <ChevronLeft />
          <span className="hidden sm:inline">Попередня</span>
        </Step>

        {items.map((item, i) =>
          item === 'ellipsis' ? (
            <span key={`gap-${i}`} aria-hidden className="px-1.5 text-muted-foreground select-none">
              …
            </span>
          ) : (
            <PageButton
              key={item}
              to={item}
              active={item === page}
              hrefFor={hrefFor}
              onPageChange={onPageChange}
            />
          )
        )}

        <Step
          to={page + 1}
          disabled={page >= totalPages}
          label="Наступна"
          hrefFor={hrefFor}
          onPageChange={onPageChange}
        >
          <span className="hidden sm:inline">Наступна</span>
          <ChevronRight />
        </Step>
      </div>
    </nav>
  );
}

type NavProps = Pick<Props, 'hrefFor' | 'onPageChange'> & { to: number };

/** The page you are on: brand tint, brand text, and nothing to click. */
const ACTIVE = 'pointer-events-none bg-brand/12 font-medium text-brand-strong';

function PageButton({ to, active, hrefFor, onPageChange }: NavProps & { active: boolean }) {
  const className = cn('w-8 tabular-nums', active && ACTIVE);

  if (hrefFor) {
    return (
      <AuroraButton
        variant="ghost"
        size="sm"
        asChild
        className={className}
        aria-current={active ? 'page' : undefined}
      >
        <Link href={hrefFor(to)}>{to}</Link>
      </AuroraButton>
    );
  }

  return (
    <AuroraButton
      type="button"
      variant="ghost"
      size="sm"
      className={className}
      aria-current={active ? 'page' : undefined}
      onClick={() => onPageChange?.(to)}
    >
      {to}
    </AuroraButton>
  );
}

function Step({
  to,
  disabled,
  label,
  hrefFor,
  onPageChange,
  children,
}: NavProps & { disabled: boolean; label: string; children: React.ReactNode }) {
  const className = 'gap-1 px-2';

  // A disabled step is rendered as a button in both modes: an <a> with no href
  // is not focusable, and pointer-events:none on a link still leaves it in the
  // tab order.
  if (hrefFor && !disabled) {
    return (
      <AuroraButton variant="ghost" size="sm" asChild className={className}>
        <Link href={hrefFor(to)} aria-label={label}>
          {children}
        </Link>
      </AuroraButton>
    );
  }

  return (
    <AuroraButton
      type="button"
      variant="ghost"
      size="sm"
      className={className}
      disabled={disabled}
      aria-label={label}
      onClick={disabled ? undefined : () => onPageChange?.(to)}
    >
      {children}
    </AuroraButton>
  );
}
