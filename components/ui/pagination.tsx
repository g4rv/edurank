import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

/**
 * Shared pager: a summary on the left, numbered pages and prev/next on the right.
 *
 * Deliberately has no `'use client'`. The two callers need different mechanics —
 * `/staff` is a Server Component and pages through the URL, `/moderation` holds
 * the page in client state — so this takes either `hrefFor` (renders links) or
 * `onPageChange` (renders buttons). Imported by a server page it stays a server
 * component; imported by a client one it is compiled into that bundle and the
 * handler works. Pass exactly one of the two.
 */

const ELLIPSIS = 'ellipsis' as const;
type PageItem = number | typeof ELLIPSIS;

/**
 * Page numbers with gaps collapsed: always the first and last page, the current
 * one and its neighbours, and an ellipsis wherever a run was dropped.
 * e.g. page 7 of 20 → 1 … 6 7 8 … 20
 */
export function pageItems(page: number, totalPages: number): PageItem[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);

  const items: PageItem[] = [1];
  const from = Math.max(2, page - 1);
  const to = Math.min(totalPages - 1, page + 1);

  if (from > 2) items.push(ELLIPSIS);
  for (let p = from; p <= to; p++) items.push(p);
  if (to < totalPages - 1) items.push(ELLIPSIS);

  items.push(totalPages);
  return items;
}

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

export function Pagination({ page, totalPages, hrefFor, onPageChange, summary, className }: Props) {
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
          <ChevronLeft className="size-4" />
          <span className="hidden sm:inline">Попередня</span>
        </Step>

        {items.map((item, i) =>
          item === ELLIPSIS ? (
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
          <ChevronRight className="size-4" />
        </Step>
      </div>
    </nav>
  );
}

type NavProps = Pick<Props, 'hrefFor' | 'onPageChange'> & { to: number };

function PageButton({ to, active, hrefFor, onPageChange }: NavProps & { active: boolean }) {
  const className = cn('w-9 tabular-nums', active && 'pointer-events-none');

  if (hrefFor) {
    return (
      <Button
        variant={active ? 'secondary' : 'ghost'}
        size="sm"
        asChild
        className={className}
        aria-current={active ? 'page' : undefined}
      >
        <Link href={hrefFor(to)}>{to}</Link>
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant={active ? 'secondary' : 'ghost'}
      size="sm"
      className={className}
      aria-current={active ? 'page' : undefined}
      onClick={() => onPageChange?.(to)}
    >
      {to}
    </Button>
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
      <Button variant="ghost" size="sm" asChild className={className}>
        <Link href={hrefFor(to)} aria-label={label}>
          {children}
        </Link>
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={className}
      disabled={disabled}
      aria-label={label}
      onClick={disabled ? undefined : () => onPageChange?.(to)}
    >
      {children}
    </Button>
  );
}
