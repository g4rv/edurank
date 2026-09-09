import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { Pencil } from 'lucide-react';
import { auth } from '@/lib/auth';
import { getStaff } from '@/lib/queries/get-staff';
import { getActiveTemplate } from '@/lib/queries/get-active-template';
import { getRatingEntry } from '@/lib/queries/get-rating';
import { getStakeBreakdown } from '@/lib/queries/get-stake-breakdown';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Button } from '@/components/aurora/ui/button';
import { EmptyState } from '@/components/aurora/ui/card';
import { StaffProfileView } from '@/components/staff/profile/staff-profile-view';
import { RatingBars } from '@/components/staff/profile/rating-bars';

/**
 * «Мій профіль» — the reader's own record.
 *
 * Built from `StaffProfileView` since 2026-09-08. It used to hand-write its own
 * `InfoCard`, `Field` and `PositionEntry`, as did `/staff/[id]` — the same five
 * cards from two separate sources, so a spacing fix on one left the other
 * behind. Both render the same components now; what still differs is what this
 * route DECIDES and hands down:
 *
 * - **`showStake` is unconditional here.** A ставка is confidential, and this is
 *   the one page where the reader is the subject. `/staff/[id]` grants it only to
 *   an ADMIN.
 * - **`canFillOwn`** — the note at the foot naming what is still blank offers a
 *   link to fix it, which only makes sense on your own record.
 * - **No tabs.** Рейтинг and Характеристика are their own sidebar items for an
 *   НПП, not siblings of this page, so there is nothing to preserve across a
 *   navigation and no `layout.tsx`.
 *
 * The component decides none of that. It has no session, and a permission
 * written in two places is one that will eventually disagree.
 */
export default async function ProfilePage() {
  const session = await auth();
  if (!session) redirect('/login');

  const staffId = session.user.staffId;
  const canAccessStaffList = session.user.role !== 'USER';
  const crumbs = canAccessStaffList
    ? [{ label: 'Персонал', href: '/staff' }, { label: 'Мій профіль' }]
    : [{ label: 'Особисте' }, { label: 'Мій профіль' }];

  // An account with no Staff row — an operator login, or a record deleted from
  // under a live session. There is nothing to render, so say so rather than 404.
  if (!staffId) {
    return (
      <div className="space-y-5">
        <Breadcrumbs items={crumbs} />
        <EmptyState>Ваш профіль не знайдено. Зверніться до адміністратора.</EmptyState>
      </div>
    );
  }

  const staff = await getStaff(staffId, true);
  if (!staff) notFound();

  const stakeParts = await getStakeBreakdown(staffId);
  const template = staff.isNpp ? await getActiveTemplate() : null;
  const entry = template ? await getRatingEntry(staffId, template.year) : null;

  return (
    <StaffProfileView
      staff={staff}
      breadcrumbs={crumbs}
      // Your own ставка is yours to see; every other reader of this record needs
      // to be an ADMIN. The route answers that, never the component.
      showStake
      stakeParts={stakeParts}
      editHref="/profile/edit"
      canFillOwn
      actions={
        <Button asChild variant="outline" size="sm">
          <Link href="/profile/edit">
            <Pencil />
            Редагувати
          </Link>
        </Button>
      }
      rating={
        template ? (
          <RatingBars
            year={template.year}
            // Bars, not six tiles. Six equal boxes gave every розділ the same
            // weight and hid the only thing worth seeing — the SHAPE of a
            // rating, and which sections somebody has submitted nothing under.
            sections={[
              entry?.section1Score ?? 0,
              entry?.section2Score ?? 0,
              entry?.section3Score ?? 0,
              entry?.section4Score ?? 0,
              entry?.section5Score ?? 0,
            ]}
            total={entry?.totalScore ?? 0}
            href="/achievements"
            linkLabel="Мій рейтинг"
          />
        ) : undefined
      }
    />
  );
}
