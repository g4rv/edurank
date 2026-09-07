import { redirect, notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import { RatingBars } from '@/components/staff/profile/rating-bars';
import { MOCK_STAFF, MOCK_SECTIONS, MOCK_TOTAL, MOCK_YEAR } from '@/app/(dashboard)/_mock/staff';

/**
 * The rating tab. Only this re-renders when the tab is clicked — everything
 * above it belongs to the layout and stays put.
 *
 * Keeps its own auth check, for the reason set out in `layout.tsx`.
 */
export default async function StaffMockRatingPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) redirect('/login');

  const { id } = await params;
  const staff = MOCK_STAFF[id];
  if (!staff) notFound();

  const filled = staff.id === 'mock-full';

  return (
    <div className="space-y-4">
      <RatingBars
        year={MOCK_YEAR}
        sections={filled ? MOCK_SECTIONS : [0, 0, 0, 0, 0]}
        total={filled ? MOCK_TOTAL : 0}
      />
      <div className="rounded-xl border border-dashed bg-muted/25 px-5 py-8 text-center text-sm text-muted-foreground">
        Тут буде повна таблиця рейтингу за розділами — вона вже існує на
        <code className="mx-1">/staff/[id]/rating</code>. У чернетці показано лише те, що змінюється
        при перемиканні вкладок.
      </div>
    </div>
  );
}
