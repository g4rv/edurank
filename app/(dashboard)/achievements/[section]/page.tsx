import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getStaff } from '@/lib/queries/get-staff';
import { getActiveTemplate, listTemplateYears } from '@/lib/queries/get-active-template';
import { listStaffActivities } from '@/lib/queries/list-activities';
import { AnimatedPage } from '@/components/ui/animated-page';
import { AchievementsList } from '@/components/rating/achievements-list';
import { AddAchievementForm } from '@/components/rating/add-achievement-form';
import { YearSelect } from '@/components/rating/year-select';
import { SECTION_TITLES } from '@/lib/rating/activity-types';
import { toAchievementGroups } from '@/lib/rating/achievement-rows';
import type { EvidenceField } from '@/lib/rating/evidence-fields';
import { evidenceFieldsSpecSchema } from '@/validations/activity-type-spec';

/** Field specs off the row's JSON; a malformed row degrades to an empty form */
function fieldsOf(activityType: { evidenceFields: unknown }): EvidenceField[] {
  const parsed = evidenceFieldsSpecSchema.safeParse(activityType.evidenceFields);
  return parsed.success ? parsed.data : [];
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
  if (!staffId || session.user.role !== 'USER') redirect('/profile');

  const staff = await getStaff(staffId, true);
  if (!staff?.isNpp) redirect('/profile');

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
