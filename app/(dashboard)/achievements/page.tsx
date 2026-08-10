import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getStaff } from '@/lib/queries/get-staff';
import { getActiveTemplate, listTemplateYears } from '@/lib/queries/get-active-template';
import { listStaffActivities } from '@/lib/queries/list-activities';
import { listTemplateIndicators } from '@/lib/queries/list-template-indicators';
import { AnimatedPage } from '@/components/ui/animated-page';
import { RatingTable } from '@/components/rating/rating-table';
import { YearSelect } from '@/components/rating/year-select';
import { DownloadButton } from '@/components/ui/download-button';
import { getRatingEntry } from '@/lib/queries/get-rating';
import { snapshotToGroups, toAchievementGroups } from '@/lib/rating/achievement-rows';

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

  // Closed year → the frozen snapshot is authoritative; open year → live rows
  const selectedStatus = templateYears.find((t) => t.year === selectedYear)?.status;
  const snapshotGroups =
    selectedStatus === 'CLOSED'
      ? snapshotToGroups((await getRatingEntry(staffId, selectedYear))?.snapshot)
      : null;

  // The catalogue fills in the indicators with nothing under them, so the table
  // shows the whole rating. Only for a year still open: a closed year is frozen
  // history, and «you could still do this» is not something to say about it.
  const catalogue = snapshotGroups ? undefined : await listTemplateIndicators(selectedYear);

  const groups =
    snapshotGroups ??
    toAchievementGroups(
      await listStaffActivities(staffId, selectedYear),
      SECTION_NUMBERS,
      false,
      catalogue
    );

  return (
    <AnimatedPage className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Мій рейтинг</h1>
          {selectedStatus === 'CLOSED' && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              Рік закрито — підсумки зафіксовано
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <DownloadButton
            href={`/api/export/ratings?year=${selectedYear}&staffId=${staffId}`}
            label="Завантажити (Excel)"
            title="Ваша офіційна форма рейтингового оцінювання"
          />
          <YearSelect years={years} value={selectedYear} />
        </div>
      </div>

      <RatingTable groups={groups} />
    </AnimatedPage>
  );
}
