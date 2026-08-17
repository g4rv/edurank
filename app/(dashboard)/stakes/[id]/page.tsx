import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { auth } from '@/lib/auth';
import { getActiveTemplate } from '@/lib/queries/get-active-template';
import { getStakeDistribution } from '@/lib/queries/get-stake-distribution';
import { listDepartmentStakes, listStatusBonuses } from '@/lib/queries/list-stake-settings';
import { headOf, scopeOf } from '@/lib/queries/scope';
import { formatStake } from '@/lib/stake/units';
import { POSITION_ORDER } from '@/lib/stake/status-bonus';
import { AnimatedPage } from '@/components/ui/animated-page';
import { DistributionGrid } from '@/components/stake/distribution-grid';
import { StakeTermHint } from '@/components/stake/stake-term-hint';
import type { AdminPosition } from '@/lib/generated/prisma/client';

/**
 * One кафедра's распределение — the завідувач's working screen.
 *
 * Split from `/stakes` on 2026-08-17. That page allocates pools across all 31
 * кафедри and belongs to the проректор; this one spreads a single pool among
 * people and belongs to the head. Two jobs, two people, two screens — and the
 * кафедра is now in the URL, so it is a link somebody can be sent.
 *
 * `Кст` is not editable here on purpose. It is set centrally, on the overview,
 * where its consequence for every other кафедра is visible at the same time.
 */
export default async function DepartmentStakesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: departmentId } = await params;

  const session = await auth();
  if (!session) redirect('/login');

  const isAdmin = session.user.role === 'ADMIN';
  const [scope, led] = isAdmin
    ? [[], []]
    : await Promise.all([scopeOf(session.user.staffId), headOf(session.user.staffId)]);
  if (!isAdmin && !scope.includes(departmentId)) notFound();

  const template = await getActiveTemplate();
  if (!template) notFound();
  const year = template.year;

  const [view, rows, statuses] = await Promise.all([
    getStakeDistribution(departmentId, year),
    listDepartmentStakes(year),
    listStatusBonuses(year),
  ]);
  if (!view) notFound();

  const selected = rows.find((r) => r.id === departmentId);
  const canEditAllocation = isAdmin || led.includes(departmentId);
  const overwritingHead = isAdmin && view.filledAt !== null;

  const statusValues = Object.fromEntries(
    POSITION_ORDER.map((p) => [p, statuses.get(p)])
  ) as Record<AdminPosition, number | undefined>;

  return (
    <AnimatedPage className="space-y-4">
      <Link
        href="/stakes"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Усі кафедри
      </Link>

      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-2xl font-semibold">{view.departmentName}</h1>
          <span className="text-sm text-muted-foreground">{year} рік</span>
        </div>

        <div className="inline-flex items-center gap-2">
          {!canEditAllocation && (
            <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
              лише перегляд
              <StakeTermHint term="deanReadonly" />
            </span>
          )}
        </div>
      </div>

      <div className="rounded-xl border bg-card px-4 py-2 text-xs text-muted-foreground">
        <span>{view.facultyName}</span>
        <span> · {view.headcount} НПП</span>
        <span className="inline-flex items-center gap-1">
          {' '}
          · ліцензійним умовам відповідають {view.knpp}
          <StakeTermHint term="knpp" />
        </span>
        <span> · середній рейтинг {Math.round(view.averageRating)}</span>
        <span className="inline-flex items-center gap-1">
          {' '}
          · початковий пул{' '}
          {view.kstHundredths === null ? 'не задано' : formatStake(view.kstHundredths)}
          <StakeTermHint term="kst" />
        </span>
        <span className="inline-flex items-center gap-1">
          {' '}
          · бонусний пул{' '}
          {selected?.bonusPoolHundredths == null
            ? 'не задано'
            : formatStake(selected.bonusPoolHundredths)}
          <StakeTermHint term="bonusPool" />
        </span>
      </div>

      {selected?.belowMinimum && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2 text-xs text-destructive">
          Кст нижче мінімуму: на кафедрі {selected.headcount} НПП, потрібно щонайменше{' '}
          {formatStake(selected.minimumHundredths)}
        </p>
      )}

      {overwritingHead && (
        <p className="rounded-lg border border-amber-600/40 bg-amber-600/5 px-4 py-2 text-xs text-amber-700 dark:text-amber-500">
          Розподіл цієї кафедри вже заповнено: {view.filledBy ?? '—'},{' '}
          {view.filledAt?.toLocaleDateString('uk-UA')}. Ваші зміни перезапишуть його і будуть
          записані на вас.
        </p>
      )}

      <DistributionGrid
        key={departmentId}
        view={view}
        canEdit={canEditAllocation}
        canEditLimits={isAdmin}
        canOpenStaffProfile={isAdmin}
        audience={isAdmin ? 'admin' : 'head'}
        statusValues={statusValues}
      />
    </AnimatedPage>
  );
}
