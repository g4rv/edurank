import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getStaff } from '@/lib/queries/get-staff';
import { getActiveTemplate, listTemplateYears } from '@/lib/queries/get-active-template';
import { getRatingEntry } from '@/lib/queries/get-rating';
import { listStaffActivities } from '@/lib/queries/list-activities';
import { listTemplateIndicators } from '@/lib/queries/list-template-indicators';
import { snapshotToGroups, toAchievementGroups } from '@/lib/rating/achievement-rows';
import { NPP_RATING_OPEN } from '@/lib/rating/npp-access';
import { EmptyState } from '@/components/aurora/ui/card';
import { RatingTable } from '@/components/rating/rating-table';
import { EmptyRowsSwitch } from '@/components/rating/rating-view';
import { YearSelect } from '@/components/rating/year-select';
import { ProfileTabRow } from '@/components/staff/profile/profile-tab-row';
import { ToolbarGroup, ToolbarDivider } from '@/components/staff/record-toolbar';
import { DownloadButton } from '@/components/ui/download-button';

const SECTION_NUMBERS = [1, 2, 3, 4, 5];

/**
 * «Мій рейтинг» — your own rating, as a tab of your own record.
 *
 * **Moved here from `/achievements` on 2026-09-09.** It was a sidebar item, so
 * your own record was three unrelated pages while somebody else's was one record
 * with three tabs. The old URL redirects.
 *
 * The same table an editor sees on `/staff/[id]/rating`, with the same controls:
 * a year, the «незаповнені» switch and the export. What differs is only that
 * this one needs no id — it is always you.
 */
export default async function MyRatingPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const query = await searchParams;
  const session = await auth();
  if (!session) redirect('/login');

  const staffId = session.user.staffId;
  // **Being an НПП is what grants this, not the USER role** (2026-08-17). This
  // is a person's own record, and the role decides what somebody may do to OTHER
  // people. A проректор who teaches, or a division editor who teaches, is
  // ordinary here.
  if (!staffId) redirect('/profile');
  const staff = await getStaff(staffId, true);
  if (!staff?.isNpp) redirect('/profile');

  // Frozen while the year is prepared. The tab row keeps its own greyed tabs and
  // the sentence under them, so a bookmark lands somewhere that explains itself.
  if (!NPP_RATING_OPEN) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-5">
        <ProfileTabRow isNpp />
        <EmptyState>Рейтинг тимчасово недоступний — рік готується.</EmptyState>
      </div>
    );
  }

  const template = await getActiveTemplate();
  const templateYears = await listTemplateYears();
  const years = templateYears.map((t) => t.year);
  const asked = typeof query.year === 'string' ? Number(query.year) : NaN;
  const year = years.includes(asked) ? asked : (template?.year ?? years[0]);

  if (!year) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-5">
        <ProfileTabRow isNpp />
        <EmptyState>Рейтинговий рік ще не налаштовано. Зверніться до адміністратора.</EmptyState>
      </div>
    );
  }

  // Closed year → the frozen snapshot is authoritative; open year → live rows.
  const closed = templateYears.find((t) => t.year === year)?.status === 'CLOSED';
  const snapshotGroups = closed
    ? snapshotToGroups((await getRatingEntry(staffId, year))?.snapshot)
    : null;

  // The catalogue fills in the indicators with nothing under them, so the table
  // shows the whole rating. Only for a year still open: a closed year is frozen
  // history, and «you could still do this» is not something to say about it.
  const catalogue = snapshotGroups ? undefined : await listTemplateIndicators(year);

  const groups =
    snapshotGroups ??
    toAchievementGroups(
      await listStaffActivities(staffId, year),
      SECTION_NUMBERS,
      false,
      catalogue
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <ProfileTabRow isNpp>
        <ToolbarGroup className="pl-3">
          <span className="text-sm text-muted-foreground">Рік</span>
          <YearSelect years={years} value={year} />
          <ToolbarDivider />
          <EmptyRowsSwitch />
          <ToolbarDivider />
          <DownloadButton
            href={`/api/export/ratings?year=${year}&staffId=${staffId}`}
            label="Вивантажити Excel"
            title="Ваша офіційна форма рейтингового оцінювання"
            variant="ghost"
          />
        </ToolbarGroup>
      </ProfileTabRow>

      <RatingTable groups={groups} fill />
    </div>
  );
}
