import Link from 'next/link';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

export function SortTh({
  label,
  href,
  active,
  dir,
}: {
  label: string;
  href: string;
  active: boolean;
  dir: 'asc' | 'desc';
}) {
  return (
    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
      <Link
        href={href}
        className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
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
