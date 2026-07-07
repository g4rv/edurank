import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getStaff } from '@/lib/queries/get-staff';
import { getActiveTemplate, listTemplateYears } from '@/lib/queries/get-active-template';
import { listStaffActivities } from '@/lib/queries/list-activities';
import { AnimatedPage } from '@/components/ui/animated-page';
import { RatingTable } from '@/components/rating/rating-table';
import { YearSelect } from '@/components/rating/year-select';
import { toAchievementGroups } from '@/lib/rating/achievement-rows';

const SECTION_NUMBERS = [1, 2, 3, 4, 5];

export default async function MyRatingPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
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
        <h1 className="text-2xl font-semibold">Мій рейтинг</h1>
        <div className="rounded-xl border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          Рейтинговий рік ще не налаштовано. Зверніться до адміністратора.
        </div>
      </AnimatedPage>
    );
  }

  const activities = await listStaffActivities(staffId, selectedYear);
  const groups = toAchievementGroups(activities, SECTION_NUMBERS);

  return (
    <AnimatedPage className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Мій рейтинг</h1>
        <YearSelect years={years} value={selectedYear} />
      </div>

      <RatingTable groups={groups} />
    </AnimatedPage>
  );
}
