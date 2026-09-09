import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { getActiveTemplate, listTemplateYears } from '@/lib/queries/get-active-template';
import { getRatingEntry } from '@/lib/queries/get-rating';
import { listStaffActivities } from '@/lib/queries/list-activities';
import { listTemplateIndicators } from '@/lib/queries/list-template-indicators';
import { snapshotToGroups, toAchievementGroups } from '@/lib/rating/achievement-rows';
import { EmptyState } from '@/components/aurora/ui/card';
import { RatingTable } from '@/components/rating/rating-table';
import { EmptyRowsSwitch } from '@/components/rating/rating-view';
import { RecordToolbar, ToolbarGroup, ToolbarDivider } from '@/components/staff/record-toolbar';
import { DownloadButton } from '@/components/ui/download-button';
import { YearSelect } from '@/components/rating/year-select';

export default async function StaffRatingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const session = await auth();
  if (!session) redirect('/login');

  if (session.user.role === 'USER') redirect('/achievements');

  const staff = await db.staff.findUnique({
    where: { id },
    select: { lastName: true, firstName: true, patronymic: true, isNpp: true },
  });
  if (!staff || !staff.isNpp) notFound();

  // Which year is on screen. The active one by default; any template year on
  // request — the same picker the НПП already has over their own rating on
  // /achievements. An editor looking at somebody had only the current year,
  // which is the one year a person's history is never a question about.
  const template = await getActiveTemplate();
  const templateYears = await listTemplateYears();
  const years = templateYears.map((t) => t.year);
  const asked = Number(query.year);
  const year = years.includes(asked) ? asked : (template?.year ?? years[0]);

  if (!year) {
    return (
      <div>
        <EmptyState>Рейтинговий рік ще не налаштовано.</EmptyState>
      </div>
    );
  }

  const status = templateYears.find((t) => t.year === year)?.status;

  // Closed year → the frozen snapshot is authoritative; open year → live rows
  const closed = status === 'CLOSED';
  const snapshotGroups = closed
    ? snapshotToGroups((await getRatingEntry(id, year))?.snapshot)
    : null;

  /**
   * A closed year with NO snapshot is an empty rating, not an open one.
   *
   * `closeYear` nulls every snapshot for the year and then writes one back only
   * for people who still hold a counting row — so somebody with nothing scored
   * ends on `null`. The `??` below then fell through to live rows AND to the
   * full catalogue, and their frozen year rendered as a list of indicators
   * «still to fill in» (2026-08-27).
   */
  const emptyClosedYear = closed && snapshotGroups === null;
  // The same whole-rating view the НПП gets of themselves. Without the
  // catalogue this table listed only the indicators already filled, so an
  // editor could not tell «this person has nothing under 3.7» from «3.7 does
  // not exist» — and the two people looking at one rating saw different tables.
  //
  // Open years only. A closed year renders from its snapshot, which is frozen
  // history: «could still be filled» is not a thing to say about it.
  const catalogue =
    snapshotGroups || emptyClosedYear ? undefined : await listTemplateIndicators(year);

  const groups =
    snapshotGroups ??
    toAchievementGroups(
      // A closed year reads its own rows, never the catalogue: whatever is
      // there is what was frozen, and an empty year stays empty.
      emptyClosedYear ? [] : await listStaffActivities(id, year),
      [1, 2, 3, 4, 5],
      false,
      catalogue
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* The year picker and the «незаповнені» switch belong on the tab row,
          which the layout renders — this portals them there. Rendered by the
          PAGE rather than fetched by the layout, because only the page knows
          which years this template has. */}
      <RecordToolbar>
        <ToolbarGroup className="pl-3">
          <span className="text-sm text-muted-foreground">Рік</span>
          <YearSelect years={years} value={year} />
          <ToolbarDivider />
          <EmptyRowsSwitch />
          <ToolbarDivider />
          <DownloadButton
            href={`/api/export/ratings?year=${year}&staffId=${id}`}
            label="Вивантажити Excel"
            title="Офіційна форма рейтингового оцінювання для цього НПП"
            variant="ghost"
          />
        </ToolbarGroup>
      </RecordToolbar>

      <RatingTable groups={groups} fill />
    </div>
  );
}
