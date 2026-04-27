'use client';

import { cn } from '@/utils/cn';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavLink {
  href: string;
  label: string;
}

export function NavLinks({ links }: { links: NavLink[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-4">
      {links.map(({ href, label }) => {
        const isActive =
          href === '/' ? pathname === '/' : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'text-sm transition-colors',
              isActive
                ? 'font-bold text-zinc-900'
                : 'text-zinc-500 hover:text-zinc-900'
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
