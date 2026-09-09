import type { StaffDetail } from '@/lib/queries/get-staff';
import { Breadcrumbs, type Crumb } from '@/components/ui/breadcrumbs';
import { IdentityBand } from './identity-band';
import { ProfileDetails } from './profile-details';
import { type StakePart } from './cards';

/**
 * A whole profile page, for a route with no sibling tabs — `/profile`.
 *
 * Header and body composed together. Where the profile DOES have siblings
 * (`/staff/[id]`, with rating and характеристика beside it) the two halves are
 * used separately instead: `IdentityBand` in a `layout.tsx`, `ProfileDetails`
 * in the `page.tsx`. Next preserves a layout across navigation between its
 * children, so a tab click re-renders only the body.
 *
 * ## It decides nothing
 *
 * Every difference between routes arrives as a prop or a slot — `showStake`
 * above all. A component with no session cannot be trusted with that answer,
 * and a permission written in two places is one that will eventually disagree.
 */
export function StaffProfileView({
  staff,
  breadcrumbs,
  showStake,
  stakeParts,
  editHref,
  canFillOwn = false,
  showEmpty = false,
  actions,
  rating,
  aside,
}: {
  staff: StaffDetail;
  breadcrumbs: Crumb[];
  showStake: boolean;
  stakeParts: StakePart[];
  editHref: string;
  canFillOwn?: boolean;
  showEmpty?: boolean;
  /** Edit / archive / restore, already filtered by the route's permissions */
  actions?: React.ReactNode;
  rating?: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="space-y-5">
      <Breadcrumbs items={breadcrumbs} />
      <IdentityBand staff={staff} actions={actions} />
      <ProfileDetails
        staff={staff}
        showStake={showStake}
        stakeParts={stakeParts}
        editHref={editHref}
        canFillOwn={canFillOwn}
        showEmpty={showEmpty}
        rating={rating}
        aside={aside}
      />
    </div>
  );
}
