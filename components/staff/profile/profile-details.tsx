import type { StaffDetail } from '@/lib/queries/get-staff';
import { missingProfileFields } from '@/lib/staff/profile-completeness';
import { MissingFieldsNote } from './missing-fields';
import {
  AcademicCard,
  ResearchProfilesCard,
  LeadershipCard,
  WorkplacesCard,
  type StakePart,
} from './cards';

/**
 * Everything below the identity band: the figures, the cards, and the note
 * naming what is still blank.
 *
 * Split out from `StaffProfileView` so the same body can be rendered two ways:
 *
 * - `/profile`, where there are no siblings, renders the header and this
 *   together through `StaffProfileView`.
 * - `/staff/[id]`, where rating and характеристика are sibling routes, renders
 *   the header in a `layout.tsx` and only this in `page.tsx`. Next preserves a
 *   layout across navigation between its children, so switching tabs re-renders
 *   this alone and the band above never flickers or refetches.
 *
 * It still decides nothing: `showStake` arrives from whichever route rendered
 * it, and is never worked out here.
 */
export function ProfileDetails({
  staff,
  showStake,
  stakeParts,
  editHref,
  canFillOwn = false,
  showEmpty = true,
  rating,
  aside,
}: {
  staff: StaffDetail;
  /** Decided by the route. Never computed in a component. */
  showStake: boolean;
  stakeParts: StakePart[];
  editHref: string;
  /**
   * Whether this reader may fill the gaps — true only on «Мій профіль».
   *
   * Gates the note entirely, not just its link. On somebody else's record it is
   * a complaint nobody present can answer.
   */
  canFillOwn?: boolean;
  showEmpty?: boolean;
  /** The rating block, when it lives on this page rather than in a tab */
  rating?: React.ReactNode;
  /** Top of the right column — the account card, ADMIN only */
  aside?: React.ReactNode;
}) {
  return (
    <div className="space-y-5">
      {rating}

      {/* Two columns split by MEANING, not by height.
          Left is the scholar — what they hold, what they have published.
          Right is the employee — where they work, what they are paid, what they
          run.

          Height would have been the tempting reason (the left column was one
          card against three), but a layout balanced against one person's data
          is unbalanced for the next: an administrative employee has no
          «Академічна інформація» at all, and a new НПП has almost nothing
          anywhere. The grouping holds whatever the record contains. */}
      <div className="flex flex-col items-start gap-4 lg:flex-row">
        <div className="flex w-full flex-1 flex-col gap-4">
          <AcademicCard staff={staff} showEmpty={showEmpty} />
          <ResearchProfilesCard staff={staff} showEmpty={showEmpty} />
        </div>

        <div className="flex w-full flex-1 flex-col gap-4">
          {aside}
          <WorkplacesCard
            staff={staff}
            stakeParts={stakeParts}
            showStake={showStake}
            showEmpty={showEmpty}
          />
          <LeadershipCard staff={staff} />
        </div>
      </div>

      {/* Last, deliberately: it is a request, not a warning. At the top it would
          open every half-filled profile with a complaint. */}
      {canFillOwn && (
        <MissingFieldsNote missing={missingProfileFields(staff)} editHref={editHref} />
      )}
    </div>
  );
}
