import Link from 'next/link';
import { cn } from '@/lib/utils';

/**
 * The НПП's two read-only views of their own record — the rating and the
 * Характеристика built from it. Same visual pattern as `StaffTabs`, which does
 * the same job on the admin-facing side of the app.
 */
export function MyRatingTabs({ active }: { active: 'rating' | 'kharakterystyka' }) {
  const tabs = [
    { key: 'rating' as const, label: 'Мій рейтинг', href: '/achievements' },
    {
      key: 'kharakterystyka' as const,
      label: 'Характеристика',
      href: '/achievements/kharakterystyka',
    },
  ];

  return (
    <div className="flex w-fit gap-1 rounded-lg bg-muted p-1">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            active === tab.key
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
