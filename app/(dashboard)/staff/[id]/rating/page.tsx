import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { getActiveTemplate } from '@/lib/queries/get-active-template';
import { getRatingEntry } from '@/lib/queries/get-rating';
import { listStaffActivities } from '@/lib/queries/list-activities';
import { snapshotToGroups, toAchievementGroups } from '@/lib/rating/achievement-rows';
import { AnimatedPage } from '@/components/ui/animated-page';
import { RatingTable } from '@/components/rating/rating-table';
import { StaffTabs } from '@/components/staff/staff-tabs';
import { DownloadButton } from '@/components/ui/download-button';

export default async function StaffRatingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session) redirect('/login');

  if (session.user.role === 'USER') redirect('/achievements');

  const staff = await db.staff.findUnique({
    where: { id },
    select: { lastName: true, firstName: true, patronymic: true, isNpp: true },
  });
  if (!staff || !staff.isNpp) notFound();

  const template = await getActiveTemplate();
  if (!template) {
    return (
      <AnimatedPage className="space-y-6">
        <div className="rounded-xl border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          Рейтинговий рік ще не налаштовано.
        </div>
      </AnimatedPage>
    );
  }

  // Closed year → the frozen snapshot is authoritative; open year → live rows
  const snapshotGroups =
    template.status === 'CLOSED'
      ? snapshotToGroups((await getRatingEntry(id, template.year))?.snapshot)
      : null;
  const groups =
    snapshotGroups ??
    toAchievementGroups(await listStaffActivities(id, template.year), [1, 2, 3, 4, 5]);

  return (
    <AnimatedPage className="space-y-6">
      <Link
        href="/staff"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Персонал
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            {staff.lastName} {staff.firstName} {staff.patronymic}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Рейтинг — {template.year} рік
            {template.status === 'CLOSED' && ' (рік закрито)'}
          </p>
        </div>
        <DownloadButton
          href={`/api/export/ratings?year=${template.year}&staffId=${id}`}
          label="Завантажити (Excel)"
          title="Офіційна форма рейтингового оцінювання для цього НПП"
        />
      </div>

      <StaffTabs staffId={id} active="rating" showRating />

      <RatingTable groups={groups} />
    </AnimatedPage>
  );
}
