import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { canModerateRating } from '@/lib/rating/moderation';
import { canOverseeScience } from '@/lib/science/oversight';
import { getActiveTemplate, listTemplateYears } from '@/lib/queries/get-active-template';
import { listNppActivities } from '@/lib/queries/list-npp-activities';
import { listScienceRecords } from '@/lib/queries/list-science-records';
import { YearSelect } from '@/components/rating/year-select';
import { ModerationList } from '@/components/rating/moderation-list';
import { RecordFeed } from '@/components/science/moderation/record-feed';
import { ACTIVITY_STATUS_LABELS } from '@/lib/rating/labels';
import { fullStaffName, shortStaffName } from '@/lib/staff-name';
import { summarizeEvidence, type EvidenceField } from '@/lib/rating/evidence-fields';
import { evidenceFieldsSpecSchema } from '@/validations/activity-type-spec';
import { UK } from '@/lib/plural';

function fieldsOf(activityType: { evidenceFields: unknown }): readonly EvidenceField[] {
  const parsed = evidenceFieldsSpecSchema.safeParse(activityType.evidenceFields);
  return parsed.success ? parsed.data : [];
}

/**
 * Two post-checks under one nav item, not one merged list: a discard on the
 * rating (`canModerateRating`) and a decline on наукова робота
 * (`canOverseeScience`, D20/D43) are two division switches, even though ННВ
 * holds both today. Each section fetches and renders
 * strictly on its OWN permission — a division holding only one of the two
 * (should an ADMIN ever configure them apart) must see exactly that one
 * section, never an empty or half-broken sibling.
 */
export default async function ModerationPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const query = await searchParams;
  const session = await auth();
  if (!session) redirect('/login');

  const canModerate = await canModerateRating(session.user);
  const canCheckScience = await canOverseeScience(session.user);
  if (!canModerate && !canCheckScience) redirect('/profile');

  // **One section fills the screen; two share it by letting the PAGE scroll.**
  // Both sections are built around a `fill` table, which takes whatever height
  // its flex parent hands it. Stacked inside one `h-full` column they halved
  // it, and the rating list — the older, busier one — came out about four rows
  // tall. Only ННВ and ADMIN hold both permissions, so this is exactly the
  // people who read this page most.
  const both = canModerate && canCheckScience;

  return (
    <div className={both ? 'flex flex-col gap-10' : 'flex h-full min-h-0 flex-col gap-8'}>
      {canModerate && <RatingSection query={query} solo={!both} />}
      {canCheckScience && <ScienceSection query={query} solo={!both} />}
    </div>
  );
}

/** A section's own height rule: the only one on the page stretches to fill it,
 *  one of two takes a readable slice and lets the page scroll past it. */
function sectionClass(solo: boolean): string {
  return solo ? 'flex min-h-0 flex-1 flex-col gap-6' : 'flex h-[38rem] flex-col gap-6';
}

async function RatingSection({
  query,
  solo,
}: {
  query: { [key: string]: string | string[] | undefined };
  solo: boolean;
}) {
  const template = await getActiveTemplate();
  const templateYears = await listTemplateYears();
  const years = templateYears.map((t) => t.year);
  const yearParam = typeof query.year === 'string' ? Number(query.year) : NaN;
  const selectedYear = years.includes(yearParam) ? yearParam : (template?.year ?? years[0]);

  if (!selectedYear) {
    return (
      <section className={sectionClass(solo)}>
        <h1 className="text-2xl font-semibold">Модерація рейтингу</h1>
        <div className="rounded-xl border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          Рейтинговий рік ще не налаштовано.
        </div>
      </section>
    );
  }

  // Discarding is only possible into the OPEN active year
  const yearOpen = !!template && template.status === 'OPEN' && selectedYear === template.year;

  const activities = await listNppActivities(selectedYear);
  const rows = activities.map((a) => ({
    id: a.id,
    // Both forms: the table shows the short one and hovers the full one.
    staffName: fullStaffName(a.staff),
    staffShortName: shortStaffName(a.staff),
    department: a.staff.department?.name ?? '',
    faculty: a.staff.department?.faculty.name ?? '',
    section: a.activityType.section.number,
    itemNumber: a.activityType.itemNumber,
    label: a.activityType.label,
    summary: summarizeEvidence(fieldsOf(a.activityType), a.evidence),
    score: a.score,
    status: a.status,
    statusLabel: ACTIVITY_STATUS_LABELS[a.status],
    removeReason: a.removeReason,
    date: a.createdAt.toLocaleDateString('uk-UA'),
    canDiscard: yearOpen && a.status === 'APPROVED',
    verified: a.verifiedAt !== null,
    canVerify: yearOpen && a.status === 'APPROVED' && a.activityType.requiresVerification,
  }));

  return (
    <section className={sectionClass(solo)}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Модерація рейтингу</h1>
          <p className="mt-0.5 text-sm text-foreground-soft">
            Самозвіти НПП за {selectedYear} рік — {UK.submission(rows.length)}
          </p>
        </div>
        <YearSelect years={years} value={selectedYear} />
      </div>

      <ModerationList rows={rows} />
    </section>
  );
}

async function ScienceSection({
  query,
  solo,
}: {
  query: { [key: string]: string | string[] | undefined };
  solo: boolean;
}) {
  const pageParam = typeof query.spage === 'string' ? Number(query.spage) : NaN;
  const page = Number.isFinite(pageParam) && pageParam >= 1 ? Math.trunc(pageParam) : 1;

  const { rows, total, totalPages } = await listScienceRecords(page);

  // Paging the science feed must not disturb the rating section's own `year`
  // choice — both live on the same URL, on separate params.
  const hrefFor = (p: number) => {
    const sp = new URLSearchParams();
    if (typeof query.year === 'string') sp.set('year', query.year);
    if (p > 1) sp.set('spage', String(p));
    const qs = sp.toString();
    return qs ? `/moderation?${qs}` : '/moderation';
  };

  return (
    <section className={sectionClass(solo)}>
      <div>
        <h2 className="text-2xl font-semibold">Наукова робота</h2>
        <p className="mt-0.5 text-sm text-foreground-soft">
          Записи про виконану наукову роботу, найновіші спочатку — {UK.record(total)}
        </p>
      </div>

      <RecordFeed
        rows={rows}
        page={Math.min(page, totalPages)}
        totalPages={totalPages}
        hrefFor={hrefFor}
      />
    </section>
  );
}
