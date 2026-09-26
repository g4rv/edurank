'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

type TabKey = 'profile' | 'rating' | 'kharakterystyka';

interface StaffTabsProps {
  /** Omit inside a `loading.tsx` — it is read from the pathname instead. */
  staffId?: string;
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
  /**
   * Rating and Характеристика only exist for НПП.
   *
   * Defaults to true so a `loading.tsx`, which has no record to ask, draws the
   * bar the overwhelming majority of records have — 328 НПП against 5
   * administrative staff.
   */
  showRating?: boolean;
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
  /**
   * Рейтинг and Характеристика are greyed and not links.
   *
   * `NPP_RATING_OPEN` is false while the year is prepared, so a person's own two
   * tabs are shut (owner, 2026-09-09). Shown rather than hidden, for the reason
   * the sidebar already gave: somebody who had those pages yesterday should see
   * that they are still theirs and temporarily closed, not that they vanished.
   * The caller puts the sentence explaining it under the row.
   *
   * `Профіль` is never disabled — it is not rating data.
   */
  frozen?: boolean;
}

export function StaffTabs({
  staffId,
  active,
  showRating = true,
  showStaffPages = true,
  basePath = '/staff',
  frozen = false,
}: StaffTabsProps) {
  const pathname = usePathname();

  if (!showRating) return null;

  // Both props are OPTIONAL, and that is what lets a `loading.tsx` draw the very
  // same bar (2026-09-09). The tab row lives in each tab's own page — a page
  // cannot hand anything to the layout above it, and the two mechanisms that
  // could (a client portal, a `@toolbar` parallel route) both misbehaved: the
  // portal never mounted on a hard reload, and the slot had the tab BODY stream
  // into its position for a frame on every load.
  //
  // Rendered from a page, the bar would then unmount and remount on every tab
  // switch, flashing. It does not, because `loading.tsx` renders this same
  // component with no props at all: the id comes from the path, `showRating`
  // assumes tabs exist, and React sees the same element in the same place across
  // the swap. There is nothing to flash.
  // **The root is the tab set's own base, and it is not always `<base>/<id>`.**
  // A record's is `/staff/<id>`; a person's own is simply `/profile`, with no id
  // in the URL at all (owner, 2026-09-09). So `basePath` may already BE the
  // root, and an id is appended only when one is given or found in the path.
  const id = staffId ?? (basePath === '/profile' ? null : pathname.split('/').filter(Boolean)[1]);
  const root = id ? `${basePath}/${id}` : basePath;
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
      {tabs.map((tab) =>
        frozen && tab.key !== 'profile' ? (
          // A span, not a styled `<Link>`: `pointer-events-none` still leaves
          // the route in the DOM for a prefetch and for anything that walks
          // links, and this one must not be followed at all. Same treatment the
          // sidebar gives the same two entries.
          <span
            key={tab.key}
            aria-disabled
            className="cursor-not-allowed rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground/60"
          >
            {tab.label}
          </span>
        ) : (
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
        )
      )}
    </div>
  );
}
