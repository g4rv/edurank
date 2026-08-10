import Link from 'next/link';
import { cn } from '@/lib/utils';

interface StaffTabsProps {
  staffId: string;
  active: 'profile' | 'rating' | 'kharakterystyka';
  /** Rating and Характеристика only exist for НПП */
  showRating: boolean;
  /**
   * Whether this viewer may open the profile and rating tabs.
   *
   * A завідувач is normally an ordinary `USER`, so `/staff` and `/staff/[id]`
   * redirect them away — but they ARE allowed to read their own people's
   * Характеристика. Offering them tabs that bounce would be worse than
   * offering none, so a head sees the document alone.
   */
  showStaffPages?: boolean;
}

export function StaffTabs({ staffId, active, showRating, showStaffPages = true }: StaffTabsProps) {
  if (!showRating) return null;

  const tabs = [
    ...(showStaffPages
      ? [
          { key: 'profile' as const, label: 'Профіль', href: `/staff/${staffId}` },
          { key: 'rating' as const, label: 'Рейтинг', href: `/staff/${staffId}/rating` },
        ]
      : []),
    {
      key: 'kharakterystyka' as const,
      label: 'Характеристика',
      href: `/staff/${staffId}/kharakterystyka`,
    },
  ];

  // One tab is not a tab bar — it is a label pretending to be a control.
  if (tabs.length < 2) return null;

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
