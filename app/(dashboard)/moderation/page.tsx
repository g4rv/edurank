import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { canModerateRating } from '@/lib/rating/moderation';
import { getActiveTemplate, listTemplateYears } from '@/lib/queries/get-active-template';
import { listNppActivities } from '@/lib/queries/list-npp-activities';
import { AnimatedPage } from '@/components/ui/animated-page';
import { YearSelect } from '@/components/rating/year-select';
import { ModerationList } from '@/components/rating/moderation-list';
import { ACTIVITY_STATUS_LABELS } from '@/lib/rating/labels';
import { fullStaffName, shortStaffName } from '@/lib/staff-name';
import { summarizeEvidence, type EvidenceField } from '@/lib/rating/evidence-fields';
import { evidenceFieldsSpecSchema } from '@/validations/activity-type-spec';
import { UK } from '@/lib/plural';

function fieldsOf(activityType: { evidenceFields: unknown }): readonly EvidenceField[] {
  const parsed = evidenceFieldsSpecSchema.safeParse(activityType.evidenceFields);
  return parsed.success ? parsed.data : [];
}

export default async function ModerationPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const query = await searchParams;
  const session = await auth();
  if (!session) redirect('/login');
  if (!(await canModerateRating(session.user))) redirect('/profile');

  const template = await getActiveTemplate();
  const templateYears = await listTemplateYears();
  const years = templateYears.map((t) => t.year);
  const yearParam = typeof query.year === 'string' ? Number(query.year) : NaN;
  const selectedYear = years.includes(yearParam) ? yearParam : (template?.year ?? years[0]);

  if (!selectedYear) {
    return (
      <AnimatedPage className="space-y-6">
        <h1 className="text-2xl font-semibold">Модерація рейтингу</h1>
        <div className="rounded-xl border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          Рейтинговий рік ще не налаштовано.
        </div>
      </AnimatedPage>
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
    <AnimatedPage className="flex h-full min-h-0 flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Модерація рейтингу</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Самозвіти НПП за {selectedYear} рік — {UK.submission(rows.length)}
          </p>
        </div>
        <YearSelect years={years} value={selectedYear} />
      </div>

      <ModerationList rows={rows} />
    </AnimatedPage>
  );
}
