import Link from 'next/link';
import { cn } from '@/lib/utils';

interface StaffTabsProps {
  staffId: string;
  active: 'profile' | 'rating';
  /** Rating tab only exists for НПП */
  showRating: boolean;
}

export function StaffTabs({ staffId, active, showRating }: StaffTabsProps) {
  if (!showRating) return null;

  const tabs = [
    { key: 'profile' as const, label: 'Профіль', href: `/staff/${staffId}` },
    { key: 'rating' as const, label: 'Рейтинг', href: `/staff/${staffId}/rating` },
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
