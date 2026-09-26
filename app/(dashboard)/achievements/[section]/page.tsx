import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getStaff } from '@/lib/queries/get-staff';
import { getActiveTemplate } from '@/lib/queries/get-active-template';
import { listStaffActivities } from '@/lib/queries/list-activities';
import { getRatingEntry } from '@/lib/queries/get-rating';
import { sectionScores } from '@/lib/rating/section-scores';
import { RatingClosedNote } from '@/components/rating/rating-closed-note';
import { NPP_RATING_OPEN } from '@/lib/rating/npp-access';
import { AchievementsList } from '@/components/rating/achievements-list';
import { AddAchievementForm } from '@/components/rating/add-achievement-form';
import { SectionHeader } from '@/components/rating/section-header';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { RATING_CRUMBS } from '@/components/rating/section-header';
import { EmptyState } from '@/components/aurora/ui/card';
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

/**
 * One section of the rating, as an НПП fills it in.
 *
 * **There is no year picker** (owner, 2026-09-11). This page is data ENTRY, and
 * an НПП only ever fills in the open year — so a control offering 2025 could
 * only ever lead somewhere nothing can be typed. It is the active template's
 * year or nothing.
 *
 * Reading a closed year is a different job and already has a screen:
 * `/profile/rating` shows any year, renders it from the frozen snapshot, and is
 * where a person goes to look rather than to add. Appeals go through ADMIN
 * `reopenYear`.
 */
export default async function AchievementsSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section: sectionParam } = await params;
  const section = Number(sectionParam);
  if (!SECTION_NUMBERS.includes(section)) notFound();

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

  if (!template) {
    return (
      <div className="space-y-5">
        <Breadcrumbs items={[...RATING_CRUMBS, { label: `Розділ ${section}` }]} />
        <SectionHeader section={section} />
        <EmptyState>Рейтинговий рік ще не налаштовано. Зверніться до адміністратора.</EmptyState>
      </div>
    );
  }

  // Only an OPEN year can be added to. A template that exists but is closed
  // still shows what is already in it — the list is the person's own record —
  // and simply offers no way to add.
  const canManage = template.status === 'OPEN';

  // The SAME stored row the sidebar reads, not a sum of the rows below. A
  // deactivated indicator still has rows on screen and scores nothing, so
  // adding up what is listed could disagree with the record — one source.
  const totals = sectionScores(await getRatingEntry(staffId, template.year));

  const activities = await listStaffActivities(staffId, template.year, section);
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
    <div className="space-y-5">
      {/* «Мої здобувачі» next door has had a trail since it was rebuilt; this
          page never got one, so the two siblings answered «where am I»
          differently. Three levels because that is the sidebar's own shape —
          Особисте › Заповнення рейтингу › Розділ N. */}
      <Breadcrumbs items={[...RATING_CRUMBS, { label: `Розділ ${section}` }]} />
      <SectionHeader
        section={section}
        score={totals?.sections[section - 1] ?? 0}
        action={<AddAchievementForm types={submittableTypes} />}
      />

      <AchievementsList groups={groups} />
    </div>
  );
}
