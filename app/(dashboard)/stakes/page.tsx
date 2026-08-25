import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getActiveTemplate } from '@/lib/queries/get-active-template';
import { listDepartmentStakes, listStatusBonuses } from '@/lib/queries/list-stake-settings';
import { scopeOf } from '@/lib/queries/scope';
import { poolTotals } from '@/lib/stake/pool-totals';
import { PRICED_POSITIONS } from '@/lib/stake/status-bonus';
import { AnimatedPage } from '@/components/ui/animated-page';
import { DepartmentPools } from '@/components/stake/department-pools';
import { PoolSummary } from '@/components/stake/pool-summary';
import { StatusBonusSettings } from '@/components/stake/status-bonus-settings';
import type { AdminPosition } from '@/lib/generated/prisma/client';

/**
 * Розподіл ставок — every кафедра and its two pools.
 *
 * **This is the allocation page, not the distribution page** (2026-08-17). It
 * used to be a picker showing one кафедра at a time, which suited a завідувач
 * and suited the проректор not at all: their job is to look across all 31 and
 * decide where ставки go, and a select made that thirty-one page loads. The
 * spreading itself lives one click away, at `/stakes/[id]`, because it is a
 * different person's work.
 *
 * ADMIN sets both funds and the position values here; the year's coefficient
 * moved to /admin/stakes/norms, beside the numbers it multiplies. A декан
 * reaching this page sees every кафедра of their faculty, read-only, and clicks
 * through to the one they want.
 *
 * **A завідувач never sees it at all** (owner, 2026-08-25). `scopeOf` resolves
 * them to the single кафедра they head, so the list was a one-row table whose
 * only function was the link inside it — and «Моя кафедра» already carries that
 * same link. They are sent straight to the grid instead; nothing is lost,
 * because /stakes/[id] prints Кст and the bonus fund at the top.
 */
export default async function StakesPage() {
  const session = await auth();
  if (!session) redirect('/login');

  const isAdmin = session.user.role === 'ADMIN';
  const scope = isAdmin ? [] : await scopeOf(session.user.staffId);
  if (!isAdmin && scope.length === 0) redirect('/profile');
  // One кафедра is not a list. Done here rather than by pointing the sidebar
  // link somewhere else, so that typing the URL behaves the same way — and the
  // nav has no кафедра id to build such a link from anyway. A декан whose
  // faculty holds a single кафедра lands on the same read-only grid, which is
  // the right screen for them too.
  if (!isAdmin && scope.length === 1) redirect(`/stakes/${scope[0]}`);

  const template = await getActiveTemplate();
  if (!template) {
    return (
      <AnimatedPage className="space-y-6">
        <h1 className="text-2xl font-semibold">Розподіл ставок</h1>
        <div className="rounded-xl border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          Рейтинговий рік ще не налаштовано.
        </div>
      </AnimatedPage>
    );
  }
  const year = template.year;

  const [allRows, statuses] = await Promise.all([
    listDepartmentStakes(year),
    listStatusBonuses(year),
  ]);

  const rows = isAdmin ? allRows : allRows.filter((r) => scope.includes(r.id));

  // `Record` rather than the Map, because this crosses into a client component
  // and a Map does not survive serialisation.
  const statusValues = Object.fromEntries(
    PRICED_POSITIONS.map((p) => [p, statuses.get(p)])
  ) as Record<AdminPosition, number | undefined>;

  // Both funds, what has been handed out of each, and what is left. The table
  // below is ten rows tall against thirty-one кафедри, so anything only a row
  // says sits under the fold with nothing on screen to announce it — which is
  // why the overspend is counted up here as well as badged on its row.
  const totals = poolTotals(rows);

  return (
    <AnimatedPage className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-semibold">Розподіл ставок</h1>
          <span className="text-sm text-muted-foreground">{year} рік</span>
        </div>

        {isAdmin && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <Link
              href="/admin/stakes/norms"
              className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Нормативи →
            </Link>
          </div>
        )}
      </div>

      <PoolSummary totals={totals} />

      <DepartmentPools rows={rows} year={year} canEdit={isAdmin} />

      {isAdmin && <StatusBonusSettings values={statusValues} year={year} />}
    </AnimatedPage>
  );
}
