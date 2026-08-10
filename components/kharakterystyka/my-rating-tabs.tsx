import Link from 'next/link';
import { cn } from '@/lib/utils';

/**
 * The НПП's own three views: the rating, the Характеристика built from it, and
 * the students they recruited. Same visual pattern as `StaffTabs`, which does
 * the same job on the admin-facing side of the app.
 */
export function MyRatingTabs({ active }: { active: 'rating' | 'kharakterystyka' | 'students' }) {
  const tabs = [
    { key: 'rating' as const, label: 'Мій рейтинг', href: '/achievements' },
    {
      key: 'kharakterystyka' as const,
      label: 'Характеристика',
      href: '/achievements/kharakterystyka',
    },
    { key: 'students' as const, label: 'Залучені здобувачі', href: '/achievements/students' },
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
