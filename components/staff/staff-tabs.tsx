'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

type TabKey = 'profile' | 'rating' | 'kharakterystyka';

interface StaffTabsProps {
  staffId: string;
  /**
   * Which tab is current.
   *
   * **Optional, and normally omitted.** When this bar is rendered from a
   * `layout.tsx` the layout does not re-render on navigation, so a value passed
   * in from there would be frozen on whichever tab was opened first — the Next
   * docs call this out directly: «Layouts do not re-render on navigation, so
   * they do not access pathname which would otherwise become stale».
   *
   * Left out, the component reads the pathname itself, which is why it is a
   * client component. Pass it only where a page renders its own bar and already
   * knows the answer.
   */
  active?: TabKey;
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
  /**
   * Route prefix the tabs point at. Exists so the rehearsal at `/staff-mock`
   * can reuse this unchanged — when that becomes the real page the only edit is
   * deleting the prop.
   */
  basePath?: string;
}

export function StaffTabs({
  staffId,
  active,
  showRating,
  showStaffPages = true,
  basePath = '/staff',
}: StaffTabsProps) {
  const pathname = usePathname();

  if (!showRating) return null;

  const root = `${basePath}/${staffId}`;
  const tabs = [
    ...(showStaffPages
      ? [
          { key: 'profile' as const, label: 'Профіль', href: root },
          { key: 'rating' as const, label: 'Рейтинг', href: `${root}/rating` },
        ]
      : []),
    {
      key: 'kharakterystyka' as const,
      label: 'Характеристика',
      href: `${root}/kharakterystyka`,
    },
  ];

  // One tab is not a tab bar — it is a label pretending to be a control.
  if (tabs.length < 2) return null;

  // Longest match wins, so `/rating` is not also matched by the profile root.
  const current =
    active ??
    tabs.reduce<TabKey>((best, tab) => {
      const hit = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
      const longer = tab.href.length > (tabs.find((t) => t.key === best)?.href.length ?? 0);
      return hit && longer ? tab.key : best;
    }, 'profile');

  return (
    // White, like every other surface on the page.
    //
    // Three attempts got here the long way. `bg-muted/70` measured 1.01:1
    // against the page — `--muted` is rgb(245,245,245) and the page is
    // rgb(246,247,250), the same colour. A foreground tint separated but came
    // out grey, because a black tint on a white page is grey by definition. A
    // brand tint carried hue but was still a one-off treatment invented for
    // this one control.
    //
    // The cards below already solve it: `bg-card` on the tinted ground, held by
    // a border. The bar is lighter than the page rather than darker, and it
    // reads as a sibling of the cards instead of a grey box sitting on top of
    // them. Nothing new to justify.
    <div className="flex w-fit gap-1 rounded-lg border bg-card p-1 shadow-xs">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={current === tab.key ? 'page' : undefined}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            current === tab.key
              ? 'bg-brand text-brand-foreground shadow-sm'
              : 'text-foreground hover:bg-brand/10 hover:text-brand-strong'
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
