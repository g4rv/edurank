import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { auth } from '@/lib/auth';
import { getActiveTemplate } from '@/lib/queries/get-active-template';
import { getStakeDistribution } from '@/lib/queries/get-stake-distribution';
import { scopeOf } from '@/lib/queries/scope';
import { formatStake } from '@/lib/stake/units';
import { AnimatedPage } from '@/components/ui/animated-page';
import { DistributionGrid } from '@/components/stake/distribution-grid';
import { StakeTermHint } from '@/components/stake/stake-term-hint';

/**
 * Розподіл ставок for one кафедра — додаток 2.
 *
 * One screen for both roles, with the columns locking by role: a завідувач
 * spreads the pool, ADMIN does that too and owns the caps and `Кст` (on
 * /admin/stakes). Keeping it one page means ADMIN sees exactly what the head
 * sees when the head phones about it.
 *
 * EDITOR is deliberately not here. A division editor may read any rating (W6),
 * but deciding who on a кафедра is paid what is the head's job.
 */
export default async function DepartmentStakesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session) redirect('/login');

  const isAdmin = session.user.role === 'ADMIN';
  const heads = isAdmin || (await scopeOf(session.user.staffId)).includes(id);
  if (!heads) notFound();

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

  const view = await getStakeDistribution(id, template.year);
  if (!view) notFound();

  const back = isAdmin
    ? { href: `/departments/${id}`, label: view.departmentName }
    : { href: '/my-department', label: 'Моя кафедра' };

  return (
    <AnimatedPage className="flex h-full min-h-0 flex-col gap-6">
      <Link
        href={back.href}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        {back.label}
      </Link>

      <div>
        <h1 className="text-2xl font-semibold">Розподіл ставок — {view.departmentName}</h1>
        <p className="mt-1 inline-flex flex-wrap items-center gap-x-1 text-sm text-muted-foreground">
          {view.year} рік · {view.headcount} НПП ·{' '}
          <span className="inline-flex items-center gap-1">
            відповідають ліцензійним умовам: {view.knpp}
            <StakeTermHint term="knpp" />
          </span>
          · середній рейтинг {Math.round(view.averageRating)}
          {view.kstHundredths !== null && ` · мінімум ${formatStake(view.minimumKstHundredths)}`}
        </p>
      </div>

      {/* The proposal now lands ON the pool — each person gets a share of Кст —
          so the old warning that its total «майже ніколи» matches is no longer
          true and would read as an excuse for an arithmetic bug. What is left
          is a few hundredths of ladder rounding, which is worth saying because
          it is the number in «Нерозподілено». */}
      {view.kstHundredths !== null && view.computable && (
        <p className="max-w-3xl text-xs text-muted-foreground">
          Формула пропонує, скільки дати кожному — частку від виділених ставок, пропорційно до
          рейтингу. Сума майже дорівнює виділеному: різниця в кілька сотих виникає через округлення
          до 0,05. Запропоновану ставку можна лише збільшити. Якщо разом вийде більше за виділене,
          збереження не блокується — але це треба врахувати у протоколі. Бонус за залучених
          здобувачів виплачується понад виділені ставки.
        </p>
      )}

      {/* The key forces the grid to re-read the server's numbers whenever they
          change. The grid keeps the typed values in local state, seeded once
          from `view` — so after ADMIN saves a cap and the route refreshes, «За
          формулою» updated while «Розподілено» and «Нерозподілено» went on
          showing the old totals. Raising a cap from 1,50 to 1,80 moved the
          formula from 12,35 to 12,65 and left «нерозподілено» at 3,65, which is
          simply a wrong number on screen.

          Remounting is the fix rather than an effect that syncs state: the
          bounds have moved, so every derived figure has to be recomputed, and
          «keep what the user typed unless it conflicts» is a rule with more
          edge cases than the thing it saves. */}
      <DistributionGrid
        key={stateKey(view)}
        view={view}
        canEdit={heads}
        canEditLimits={isAdmin}
        canOpenStaffProfile={isAdmin}
      />
    </AnimatedPage>
  );
}

/**
 * Everything on the screen that the SERVER decides, as one string.
 *
 * Used as the grid's React key, so the grid remounts — and re-seeds its local
 * state — exactly when one of these changes, and not on every render. The
 * allocation is in here too: after a save the route refreshes, and without it
 * the grid would keep its own copy of numbers the server has since rewritten.
 */
function stateKey(view: NonNullable<Awaited<ReturnType<typeof getStakeDistribution>>>): string {
  return [
    view.kstHundredths,
    ...view.rows.map((r) =>
      [r.staffId, r.formulaHundredths, r.proposedHundredths, r.minHundredths, r.maxHundredths].join(
        ':'
      )
    ),
  ].join('|');
}
