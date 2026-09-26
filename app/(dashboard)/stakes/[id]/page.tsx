import { notFound, redirect } from 'next/navigation';
import { Wallet } from 'lucide-react';
import { Badge } from '@/components/aurora/ui/badge';
import { Card } from '@/components/aurora/ui/card';
import { ListHeader } from '@/components/aurora/ui/list-header';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { auth } from '@/lib/auth';
import { getActiveTemplate } from '@/lib/queries/get-active-template';
import { getStakeDistribution } from '@/lib/queries/get-stake-distribution';
import { listDepartmentStakes, listStatusBonuses } from '@/lib/queries/list-stake-settings';
import { headOf } from '@/lib/queries/scope';
import { formatStake } from '@/lib/stake/units';
import { PRICED_POSITIONS } from '@/lib/stake/status-bonus';
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
  // The кафедра's head, or ADMIN. A декан used to read every grid of their
  // факультет here; розподіл ставок is not theirs any more (owner,
  // 2026-09-24), and saving always required `headOf`.
  const led = isAdmin ? [] : await headOf(session.user.staffId);
  if (!isAdmin && !led.includes(departmentId)) notFound();

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
    // `flex h-full min-h-0 flex-col`: the grid's table takes the height that is
    // left and its rows scroll inside it, so the page itself does not — the
    // `fill` pattern of `/rating` and `/my-department`.
    <div className="flex h-full min-h-0 flex-col gap-4">
      {/* ADMIN arrives from the overview of all 31 кафедри and goes back to it.
          A head has one кафедра: «Усі кафедри» sent them to `/stakes`, which
          redirects straight back here — a link that looped to its own page. */}
      {isAdmin && (
        <Breadcrumbs
          items={[{ label: 'Розподіл ставок', href: '/stakes' }, { label: view.departmentName }]}
        />
      )}

      <ListHeader
        title={view.departmentName}
        subtitle={
          // The strip that sat under the title, folded in. Its two fund
          // figures are gone: the cards below state both, with what is left
          // of each, and saying them twice on one screen is how the two
          // copies drift. Both years, whenever they differ — the ставки are
          // for one year and the rating that ranked them comes from another.
          <span className="inline-flex flex-wrap items-center gap-x-1">
            {year} рік
            {view.ratingYear !== year && ` · за рейтингом ${view.ratingYear}`}
            {` · ${view.facultyName} · ${view.headcount} НПП · ліцензійним умовам відповідають ${view.knpp}`}
            <StakeTermHint term="knpp" />
            {` · середній рейтинг ${Math.round(view.averageRating)}`}
          </span>
        }
        actions={
          !canEditAllocation ? (
            <Badge tone="muted">
              лише перегляд
              <StakeTermHint term="deanReadonly" />
            </Badge>
          ) : undefined
        }
      />

      {selected?.belowMinimum && (
        <p className="shrink-0 rounded-lg border border-error/30 bg-error-surface px-4 py-2 text-xs text-error-strong">
          Основний фонд нижче мінімуму: на кафедрі {selected.headcount} НПП, потрібно щонайменше{' '}
          {formatStake(selected.minimumHundredths)}
        </p>
      )}

      {noPool && !isAdmin ? (
        <Card className="flex flex-col items-center gap-3 py-16 text-center">
          <Wallet className="size-8 text-muted-foreground/50" aria-hidden />
          <h2 className="text-base font-semibold">Основний фонд ще не встановлено</h2>
          <p className="max-w-md text-sm text-foreground-soft">
            Розподіл відкриється, щойно адміністратор виділить кафедрі фонд ставок на {year} рік.
            Поки його немає, формула не рахується й зберегти розподіл неможливо.
          </p>
          {selected && (
            // The number to ask for, not just «ask somebody». A head who has to
            // request an allocation may as well be able to say how much the
            // кафедра needs at minimum.
            <p className="text-xs text-foreground-soft">
              Кафедрі потрібно щонайменше {formatStake(selected.minimumHundredths)} —{' '}
              {selected.headcount} НПП × 0,10.
            </p>
          )}
        </Card>
      ) : (
        <DistributionGrid
          key={`${departmentId}:${limitsSignature}`}
          view={view}
          canEdit={canEditAllocation}
          canEditLimits={canEditAllocation}
          canOpenStaffProfile={isAdmin}
          audience={isAdmin ? 'admin' : 'head'}
          statusValues={statusValues}
          warnOverwrite={warnOverwrite}
          filledBy={view.filledBy}
          filledAt={view.filledAt}
        />
      )}
    </div>
  );
}
