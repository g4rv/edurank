'use client';

import { usePathname } from 'next/navigation';
import { YearSelect } from '@/components/rating/year-select';
import { EmptyRowsSwitch } from '@/components/rating/rating-view';
import { KharakterystykaSummary } from '@/components/kharakterystyka/kharakterystyka-table';
import { MOCK_KHARAKTERYSTYKA } from '@/app/(dashboard)/_mock/staff';
import { MOCK_YEAR, MOCK_YEARS } from '@/app/(dashboard)/_mock/staff';

/**
 * The rating tab's controls — year first, then the «незаповнені» switch — on
 * the tab row rather than above the table.
 *
 * They belong beside the tabs because they say WHAT you are looking at: which
 * year, and how much of the catalogue. A strip of its own between the tabs and
 * the table belonged to neither (owner, 2026-09-08).
 *
 * **It reads the pathname itself**, for the same reason `StaffTabs` does: this
 * sits in a layout, layouts do not re-render on navigation, and an `active` prop
 * passed down from one would be frozen on whichever tab was opened first.
 *
 * A year means nothing on «Профіль» — a person's contacts are not per-year — so
 * it appears only where it changes something. Характеристика is deliberately
 * left out for now: its window is five years wide, so «2026» would be a
 * misleading thing to put above it without deciding what it selects.
 */
export function MockRatingControls() {
  const pathname = usePathname();

  // Характеристика's own summary sits in the same place, for the same reason:
  // it says what you are looking at rather than being part of the document.
  if (pathname.endsWith('/kharakterystyka')) {
    return <KharakterystykaSummary data={MOCK_KHARAKTERYSTYKA} />;
  }

  if (!pathname.endsWith('/rating')) return null;

  return (
    // The same shell as the tab bar and the account bar —
    // `rounded-lg border bg-card p-1 shadow-xs` — so the row reads as two or
    // three panels of one kind rather than as a pill with a loose control
    // floating beside it (owner, 2026-09-08).
    //
    // `p-1` around an `h-8` control comes to the tab bar's own 40px, which is
    // what lines the three up without anybody measuring.
    <div className="flex items-center gap-2 rounded-lg border bg-card p-1 pl-3 shadow-xs">
      {/* Labelled like «Роль» on the account bar. The select alone said «2026»,
          which is a year but not a statement about what it selects. */}
      <span className="text-sm text-muted-foreground">Рік</span>
      <YearSelect years={MOCK_YEARS} value={MOCK_YEAR} />
      <span aria-hidden className="h-5 w-px bg-border" />
      <EmptyRowsSwitch />
    </div>
  );
}
