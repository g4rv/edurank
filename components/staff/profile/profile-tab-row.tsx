import { StaffTabs } from '@/components/staff/staff-tabs';
import { ToolbarRow } from '@/components/staff/record-toolbar';
import {
  RatingToolbarShell,
  KharakterystykaToolbarShell,
} from '@/components/staff/profile/record-tab-row';
import { NPP_RATING_OPEN, NPP_RATING_CLOSED_NAV_NOTE } from '@/lib/rating/npp-access';

/**
 * «Мій профіль»'s own tab row — Профіль · Рейтинг · Характеристика.
 *
 * The same three tabs a record has, pointing at `/profile`, `/profile/rating`
 * and `/profile/kharakterystyka`. Rendered by each tab's page rather than the
 * layout, for the reason `RecordTabRow` explains: a page cannot hand anything to
 * its layout, and both mechanisms that could were built and removed.
 *
 * **A non-НПП gets no bar at all.** `StaffTabs` returns null without
 * `showRating`, which is right: an administrative employee has no rating and no
 * Характеристика, so a lone «Профіль» tab would be a label pretending to be a
 * control.
 *
 * **While the year is being prepared the two are greyed, not hidden** — and the
 * sentence saying why sits under the row, where the disabled thing is. It used
 * to live in the sidebar under the same two entries; it moved with them.
 */
export function ProfileTabRow({
  isNpp,
  children,
}: {
  isNpp: boolean;
  /** This tab's own controls, if it has any. */
  children?: React.ReactNode;
}) {
  if (!isNpp) return null;

  return (
    <div className="space-y-2">
      <ToolbarRow>
        <StaffTabs basePath="/profile" showRating frozen={!NPP_RATING_OPEN} />
        {children}
      </ToolbarRow>
      {!NPP_RATING_OPEN && (
        <p className="text-xs text-muted-foreground">{NPP_RATING_CLOSED_NAV_NOTE}</p>
      )}
    </div>
  );
}

/**
 * The same row while a tab loads.
 *
 * The tab bar is the real `StaffTabs` — it needs nothing a loading file cannot
 * give it, so React sees the same element across the swap and the bar does not
 * blink. Only the tab's own controls are a shell.
 */
export function ProfileTabRowSkeleton({ toolbar }: { toolbar?: 'rating' | 'kharakterystyka' }) {
  return (
    <div className="space-y-2">
      <ToolbarRow>
        <StaffTabs basePath="/profile" showRating frozen={!NPP_RATING_OPEN} />
        {toolbar === 'rating' && <RatingToolbarShell />}
        {toolbar === 'kharakterystyka' && <KharakterystykaToolbarShell />}
      </ToolbarRow>
      {!NPP_RATING_OPEN && (
        <p className="text-xs text-muted-foreground">{NPP_RATING_CLOSED_NAV_NOTE}</p>
      )}
    </div>
  );
}
