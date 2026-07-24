import Link from 'next/link';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export function SortTh({
  label,
  href,
  active,
  dir,
  align = 'left',
  className,
  title,
}: {
  label: string;
  href: string;
  active: boolean;
  dir: 'asc' | 'desc';
  /** Right-align for numeric columns (scores, counts) */
  align?: 'left' | 'right';
  /** Extra th classes, e.g. a fixed width — merged, so it wins over the defaults */
  className?: string;
  title?: string;
}) {
  return (
    <th
      title={title}
      className={cn(
        'px-4 py-3 font-medium text-muted-foreground',
        align === 'right' ? 'text-right' : 'text-left',
        className
      )}
    >
      <Link
        href={href}
        className={cn(
          'inline-flex items-center gap-1 transition-colors hover:text-foreground',
          align === 'right' && 'flex-row-reverse'
        )}
      >
        {label}
        {active ? (
          dir === 'asc' ? (
            <ChevronUp className="size-3.5" />
          ) : (
            <ChevronDown className="size-3.5" />
          )
        ) : (
          <ChevronsUpDown className="size-3.5 opacity-40" />
        )}
      </Link>
    </th>
  );
}
