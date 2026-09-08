import { redirect, notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import { RatingTable } from '@/components/rating/rating-table';
import {
  MOCK_STAFF,
  MOCK_RATING_GROUPS,
  MOCK_RATING_GROUPS_EMPTY,
} from '@/app/(dashboard)/_mock/staff';

/**
 * The rating tab. Only this re-renders when the tab is clicked — everything
 * above it belongs to the layout and stays put.
 *
 * Keeps its own auth check, for the reason set out in `layout.tsx`.
 *
 * **It renders the REAL `RatingTable`**, on invented rows, rather than a
 * facsimile of it. The table is 180 lines of column rules — `wrap-anywhere` on
 * the label, the suppressed «Зараховано» pill, the subtotal arithmetic — and a
 * copy of it here would drift from the original within a day and would prove
 * nothing about the thing that actually ships. Same reason `/staff-mock/[id]/edit`
 * mounts the real `StaffFormFields`.
 *
 * That also means this page is where a change to the table gets LOOKED at
 * before it lands on `/staff/[id]/rating` and `/achievements`, which are the
 * two screens that render it for real.
 */
export default async function StaffMockRatingPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) redirect('/login');

  const { id } = await params;
  const staff = MOCK_STAFF[id];
  if (!staff) notFound();

  const filled = staff.id === 'mock-full';

  return (
    // No summary bars above the table (owner, 2026-09-08). The table already
    // carries a subtotal on every section heading and the year's total at its
    // foot, so the card above it printed the same six numbers a second time,
    // higher up — and the reader then had to work out whether the two agreed.
    <div className="flex min-h-0 flex-1 flex-col">
      {/* The empty person gets the catalogue with nothing filled in, which is
          what a new НПП actually sees — and the state the «Показувати
          незаповнені» switch matters most for. */}
      <RatingTable groups={filled ? MOCK_RATING_GROUPS : MOCK_RATING_GROUPS_EMPTY} fill />
    </div>
  );
}
