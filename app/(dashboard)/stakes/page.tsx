import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getActiveTemplate } from '@/lib/queries/get-active-template';
import { listDepartmentStakes, listStatusBonuses } from '@/lib/queries/list-stake-settings';
import { scopeOf } from '@/lib/queries/scope';
import { formatStake } from '@/lib/stake/units';
import { POSITION_ORDER } from '@/lib/stake/status-bonus';
import { AnimatedPage } from '@/components/ui/animated-page';
import { DepartmentPools } from '@/components/stake/department-pools';
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
 * moved to /admin/stakes/norms, beside the numbers it multiplies. A
 * завідувач or декан reaching this page sees their own кафедри, read-only, and
 * clicks through to the one they actually work on.
 */
export default async function StakesPage() {
  const session = await auth();
  if (!session) redirect('/login');

  const isAdmin = session.user.role === 'ADMIN';
  const scope = isAdmin ? [] : await scopeOf(session.user.staffId);
  if (!isAdmin && scope.length === 0) redirect('/profile');

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
    POSITION_ORDER.map((p) => [p, statuses.get(p)])
  ) as Record<AdminPosition, number | undefined>;

  const totalKst = rows.reduce((sum, r) => sum + (r.kstHundredths ?? 0), 0);
  const totalBonus = rows.reduce((sum, r) => sum + (r.bonusPoolHundredths ?? 0), 0);
  const unset = rows.filter((r) => r.kstHundredths === null).length;

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

      {/* The two totals the проректор is actually accountable for, and how many
          кафедри they have not funded yet — the one number that says whether
          this page still has work on it. */}
      <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2 rounded-xl border bg-card px-5 py-3 text-sm">
        <span>
          <span className="text-muted-foreground">Кафедр: </span>
          <span className="font-medium tabular-nums">{rows.length}</span>
        </span>
        <span>
          <span className="text-muted-foreground">Основні фонди разом: </span>
          <span className="font-medium tabular-nums">{formatStake(totalKst)}</span>
        </span>
        <span>
          <span className="text-muted-foreground">Бонусні фонди разом: </span>
          <span className="font-medium tabular-nums">{formatStake(totalBonus)}</span>
        </span>
        {unset > 0 && (
          <span className="text-amber-700 dark:text-amber-500">без фонду: {unset}</span>
        )}
      </div>

      <DepartmentPools rows={rows} year={year} canEdit={isAdmin} />

      {isAdmin && <StatusBonusSettings values={statusValues} year={year} />}
    </AnimatedPage>
  );
}
