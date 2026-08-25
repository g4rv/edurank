import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getStaff } from '@/lib/queries/get-staff';
import { getActiveTemplate, listTemplateYears } from '@/lib/queries/get-active-template';
import { listStaffActivities } from '@/lib/queries/list-activities';
import { AnimatedPage } from '@/components/ui/animated-page';
import { RatingClosedNote } from '@/components/rating/rating-closed-note';
import { NPP_RATING_OPEN } from '@/lib/rating/npp-access';
import { AchievementsList } from '@/components/rating/achievements-list';
import { AddAchievementForm } from '@/components/rating/add-achievement-form';
import { YearSelect } from '@/components/rating/year-select';
import { SECTION_TITLES } from '@/lib/rating/activity-types';
import { toAchievementGroups } from '@/lib/rating/achievement-rows';
import type { EvidenceField } from '@/lib/rating/evidence-fields';
import { evidenceFieldsSpecSchema, scoringSpecSchema } from '@/validations/activity-type-spec';
import type { ScoringSpec } from '@/lib/rating/scoring';

/** Field specs off the row's JSON; a malformed row degrades to an empty form */
function fieldsOf(activityType: { evidenceFields: unknown }): EvidenceField[] {
  const parsed = evidenceFieldsSpecSchema.safeParse(activityType.evidenceFields);
  return parsed.success ? parsed.data : [];
}

/** The scoring rule, for the form's rule-level checks. A malformed row falls
 *  back to FIXED, which adds no extra rule — the field checks still run. */
function scoringOf(activityType: { scoring: unknown }): ScoringSpec {
  const parsed = scoringSpecSchema.safeParse(activityType.scoring);
  return parsed.success ? parsed.data : { kind: 'FIXED' };
}

const SECTION_NUMBERS = [1, 2, 3, 4, 5];

export default async function AchievementsSectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { section: sectionParam } = await params;
  const section = Number(sectionParam);
  if (!SECTION_NUMBERS.includes(section)) notFound();

  const query = await searchParams;
  const session = await auth();
  if (!session) redirect('/login');

  const staffId = session.user.staffId;
  // **Being an НПП is what grants this, not the USER role** (2026-08-17). These
  // are a person's own record, and the role decides what somebody may do to
  // OTHER people — not whether they can see their own rating. A проректор who
  // teaches, or a division editor who teaches, is ordinary here; `create-admin`
  // already says «flip isNpp on their profile later if the person is also an
  // НПП», and the pages used to bounce exactly that person.
  if (!staffId) redirect('/profile');

  const staff = await getStaff(staffId, true);
  if (!staff?.isNpp) redirect('/profile');

  // Frozen for НПП while `NPP_RATING_OPEN` is false. The note keeps this page's
  // own heading rather than redirecting to /profile, so a bookmark still lands
  // somewhere that explains itself.
  if (!NPP_RATING_OPEN)
    return <RatingClosedNote title={`Розділ ${section}. ${SECTION_TITLES[section]}`} />;

  const template = await getActiveTemplate();
  const templateYears = await listTemplateYears();
  const years = templateYears.map((t) => t.year);
  const yearParam = typeof query.year === 'string' ? Number(query.year) : NaN;
  const selectedYear = years.includes(yearParam) ? yearParam : (template?.year ?? years[0]);

  if (!selectedYear) {
    return (
      <AnimatedPage className="space-y-6">
        <h1 className="text-2xl font-semibold">
          Розділ {section}. {SECTION_TITLES[section]}
        </h1>
        <div className="rounded-xl border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          Рейтинговий рік ще не налаштовано. Зверніться до адміністратора.
        </div>
      </AnimatedPage>
    );
  }

  // The active template's OPEN year is the one the NPP can edit (submit + delete)
  const canManage = !!template && template.status === 'OPEN' && selectedYear === template.year;

  const activities = await listStaffActivities(staffId, selectedYear, section);
  const groups = toAchievementGroups(activities, undefined, canManage);

  const submittableTypes = canManage
    ? template.activityTypes
        .filter((t) => t.section.number === section)
        .map((t) => ({
          id: t.id,
          label: t.label,
          itemNumber: t.itemNumber,
          coefficientNote: t.coefficientNote,
          fields: fieldsOf(t),
          scoring: scoringOf(t),
        }))
    : [];

  return (
    <AnimatedPage className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          Розділ {section}. {SECTION_TITLES[section]}
        </h1>
        <YearSelect years={years} value={selectedYear} />
      </div>

      {submittableTypes.length > 0 && <AddAchievementForm types={submittableTypes} />}

      <AchievementsList groups={groups} />
    </AnimatedPage>
  );
}
