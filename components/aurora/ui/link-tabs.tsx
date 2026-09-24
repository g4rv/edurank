import Link from 'next/link';
import { cn } from '@/lib/utils';

/**
 * A tab bar whose tabs are LINKS — the tab lives in the URL, so it survives a
 * refresh and the Back button, and the server renders only the tab asked for.
 *
 * The look of `StaffTabs` and the science `RecordTabs`, which each draw it by
 * hand: the active tab takes `--brand` (§3), the bar is `bg-card` on the wash
 * (§1). Those two predate this and should move onto it (backlog, §11) — every
 * new tab bar starts here.
 */
export function LinkTabs({
  tabs,
  className,
}: {
  tabs: readonly { href: string; label: string; active: boolean; count?: number }[];
  className?: string;
}) {
  return (
    <nav className={cn('flex w-fit gap-1 rounded-lg border bg-card p-1 shadow-xs', className)}>
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.active ? 'page' : undefined}
          className={cn(
            'flex h-8 items-center rounded-md px-3 text-sm font-medium transition-colors',
            tab.active
              ? 'bg-brand text-brand-foreground shadow-sm'
              : 'text-foreground hover:bg-brand/10 hover:text-brand-strong'
          )}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span
              className={cn(
                'ml-1.5 tabular-nums',
                tab.active ? 'text-brand-foreground/70' : 'text-foreground-soft'
              )}
            >
              {tab.count}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}
