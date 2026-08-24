import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft, Wallet } from 'lucide-react';
import { auth } from '@/lib/auth';
import { getActiveTemplate } from '@/lib/queries/get-active-template';
import { getStakeDistribution } from '@/lib/queries/get-stake-distribution';
import { listDepartmentStakes, listStatusBonuses } from '@/lib/queries/list-stake-settings';
import { headOf, scopeOf } from '@/lib/queries/scope';
import { formatStake } from '@/lib/stake/units';
import { PRICED_POSITIONS } from '@/lib/stake/status-bonus';
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

  /**
   * No fund yet — the завідувач gets an explanation instead of the grid.
   *
   * Nothing on that grid works before the проректор allocates: the formula
   * proposes nothing (`formulaShares` skips the floor entirely at `Кст` 0,
   * because a кафедра nobody has funded does not hand out 0,10 apiece) and
   * `saveDistribution` refuses every write. What the head met was a full table
   * of zeroes they could type into and never save — and the one person who
   * could fix it was somebody else (owner, 2026-08-17).
   *
   * **ADMIN still sees the grid.** They are the person who sets the fund, and
   * they set the Мін/Макс limits, which write through `setStaffLimits` and need
   * no fund at all — sending them to an empty state would take away work they
   * can legitimately do before the money is decided.
   */
  const noPool = view.kstHundredths === null;
  // ADMIN typing over a split somebody has already saved. It used to be a
  // standing amber band above the table, which sat there while they were only
  // reading and repeated what the toolbar's «Заповнив: …» already says. It is
  // now a confirmation raised by the first edit — at the moment of the act
  // rather than beside it (owner, 2026-08-17).
  const warnOverwrite = isAdmin && view.filledAt !== null;

  /**
   * Remount the grid whenever anybody's Мін/Макс moves.
   *
   * `key={departmentId}` was stable across the `router.refresh()` that follows
   * a cap change, so React kept the component and every row's typed state with
   * it, while «за формулою» moved underneath in the props. Both passes of
   * `formulaShares` divide by sums over the whole кафедра, so one person's new
   * cap changes every share — and untouched rows were left sitting below their
   * own proposal, which «тільки збільшити» forbids and the server now refuses.
   *
   * Safe to remount: every edit autosaves, so no typed state is waiting to be
   * written when the key changes.
   */
  const limitsSignature = view.rows
    .map((r) => `${r.staffId}:${r.minHundredths}:${r.maxHundredths}`)
    .join('|');

  const statusValues = Object.fromEntries(
    PRICED_POSITIONS.map((p) => [p, statuses.get(p)])
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
          {/* Both years, whenever they differ. The ставки are for one year and
              the rating that ranked them comes from another, and an all-zero
              column is only explainable once the screen says which. */}
          <span className="text-sm text-muted-foreground">
            {year} рік
            {view.ratingYear !== year && ` · за рейтингом ${view.ratingYear}`}
          </span>
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
        <span>
          {' '}
          · середній рейтинг {Math.round(view.averageRating)} за {view.ratingYear}
        </span>
        <span className="inline-flex items-center gap-1">
          {' '}
          · основний фонд{' '}
          {view.kstHundredths === null ? 'не задано' : formatStake(view.kstHundredths)}
          <StakeTermHint term="kst" />
        </span>
        <span className="inline-flex items-center gap-1">
          {' '}
          · бонусний фонд{' '}
          {selected?.bonusPoolHundredths == null
            ? 'не задано'
            : formatStake(selected.bonusPoolHundredths)}
          <StakeTermHint term="bonusPool" />
        </span>
      </div>

      {selected?.belowMinimum && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2 text-xs text-destructive">
          Основний фонд нижче мінімуму: на кафедрі {selected.headcount} НПП, потрібно щонайменше{' '}
          {formatStake(selected.minimumHundredths)}
        </p>
      )}

      {noPool && !isAdmin ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card px-6 py-16 text-center">
          <Wallet className="size-8 text-muted-foreground/50" aria-hidden />
          <h2 className="text-base font-medium">Основний фонд ще не встановлено</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            Розподіл відкриється, щойно адміністратор виділить кафедрі фонд ставок на {year} рік.
            Поки його немає, формула не рахується й зберегти розподіл неможливо.
          </p>
          {selected && (
            // The number to ask for, not just «ask somebody». A head who has to
            // request an allocation may as well be able to say how much the
            // кафедра needs at minimum.
            <p className="text-xs text-muted-foreground">
              Кафедрі потрібно щонайменше {formatStake(selected.minimumHundredths)} —{' '}
              {selected.headcount} НПП × 0,10.
            </p>
          )}
        </div>
      ) : (
        <DistributionGrid
          key={`${departmentId}:${limitsSignature}`}
          view={view}
          canEdit={canEditAllocation}
          canEditLimits={isAdmin}
          canOpenStaffProfile={isAdmin}
          audience={isAdmin ? 'admin' : 'head'}
          statusValues={statusValues}
          warnOverwrite={warnOverwrite}
          filledBy={view.filledBy}
          filledAt={view.filledAt}
        />
      )}
    </AnimatedPage>
  );
}
