import { notFound, redirect } from 'next/navigation';
import { canViewAcademicRecord } from '@/lib/queries/scope';
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
import { YearSelect } from '@/components/rating/year-select';
import { RecordTabRow } from '@/components/staff/profile/record-tab-row';
import { ToolbarGroup, ToolbarDivider } from '@/components/staff/record-toolbar';
import { DownloadButton } from '@/components/ui/download-button';

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

  // A завідувач or декан READS the records of their кафедра's people
  // (owner, 2026-09-24) — `canViewAcademicRecord`, the rule the
  // Характеристика already used. Read-only: every control on the record is
  // ADMIN's or an EDITOR's, and the ставка stays ADMIN's and the person's own.
  // A USER on their OWN record still goes to /profile, which is theirs.
  if (
    session.user.role === 'USER' &&
    (session.user.staffId === id || !(await canViewAcademicRecord(session.user, id)))
  ) {
    redirect('/profile');
  }

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

  // The same whole-rating view the НПП gets of themselves. Without the
  // catalogue this table listed only the indicators already filled, so an
  // editor could not tell «this person has nothing under 3.7» from «3.7 does
  // not exist» — and the two people looking at one rating saw different tables.
  //
  // **A closed year gets it too** (owner, 2026-09-21). It was open years only,
  // because «could still be filled» is not a thing to say about frozen history.
  // An empty row says no such thing: it names an indicator, and the argument
  // above — one rating, one table — holds just as hard for 2025.
  const catalogue = await listTemplateIndicators(year);

  const snapshotGroups = closed
    ? snapshotToGroups((await getRatingEntry(id, year))?.snapshot, catalogue)
    : null;

  /**
   * A closed year with NO snapshot is an empty rating, not an open one.
   *
   * `closeYear` nulls every snapshot for the year and then writes one back only
   * for people who still hold a counting row — so somebody with nothing scored
   * ends on `null`. Without this the `??` below fell through to LIVE rows
   * (2026-08-27), which is the part that was wrong; the catalogue beside them
   * was not, and stays.
   */
  const groups =
    snapshotGroups ??
    toAchievementGroups(
      closed ? [] : await listStaffActivities(id, year),
      [1, 2, 3, 4, 5],
      false,
      catalogue
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      {/* The year picker, the switch and the export sit on the tab row, and this
          page renders that row. The switch and the table are in ONE page again,
          which is what lets the count travel between them — it read «(0)» for as
          long as they sat in two different parallel-route slots. */}
      <RecordTabRow staffId={id} showRating>
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
      </RecordTabRow>

      <RatingTable groups={groups} fill />
    </div>
  );
}
