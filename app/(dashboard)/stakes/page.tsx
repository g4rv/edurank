import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getActiveTemplate } from '@/lib/queries/get-active-template';
import { getStakeDistribution } from '@/lib/queries/get-stake-distribution';
import { getStakeSandbox, EMPTY_SANDBOX } from '@/lib/queries/get-stake-sandbox';
import { getStakeYearSettings, listDepartmentStakes } from '@/lib/queries/list-stake-settings';
import { headOf, scopeOf } from '@/lib/queries/scope';
import { formatStake, fromHundredths } from '@/lib/stake/units';
import { AnimatedPage } from '@/components/ui/animated-page';
import { StakeValueForm } from '@/components/admin/stake-value-form';
import { DistributionGrid } from '@/components/stake/distribution-grid';
import { DepartmentSelect } from '@/components/department-select';
import { AllDepartmentsDialog } from '@/components/stake/all-departments-dialog';
import { SandboxControls } from '@/components/stake/sandbox-controls';
import { StakeTermHint } from '@/components/stake/stake-term-hint';
import { setDepartmentStake, setStakeYearSettings } from '@/app/(dashboard)/admin/stakes/actions';
import { cn } from '@/lib/utils';

/**
 * Розподіл ставок — one page for the whole thing.
 *
 * It used to be two: ADMIN typed `Кст` on /admin/stakes, then clicked through to
 * /departments/[id]/stakes to see what that `Кст` had done, then back again to
 * change it. The number and its consequence were never on screen together.
 *
 * What each role gets (2026-08-12):
 *
 *   ADMIN — any кафедра, the pool, the caps, the year's coefficient, and a
 *           SANDBOX. They may not write a кафедра's split; the real tab is a
 *           read-only view of what the head decided, so «phone me about my
 *           ставка» is answerable without asking anybody to share a screen.
 *   Head  — their own кафедра, the split, and nothing else. `Кст` and the caps
 *           are shown because bounds you cannot see are bounds you file a bug
 *           about, and read-only because a head who could raise their own cap
 *           and drop a colleague's would make the caps meaningless.
 *
 * EDITOR is deliberately not here. A division editor may read any rating (W6),
 * but deciding who on a кафедра is paid what is the head's job.
 */
export default async function StakesPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string; tab?: string }>;
}) {
  const session = await auth();
  if (!session) redirect('/login');

  const { d, tab } = await searchParams;
  const isAdmin = session.user.role === 'ADMIN';

  // Two different questions, and a декан answers them differently: `scopeOf`
  // covers every кафедра of their faculty and decides what they may READ,
  // `headOf` only the ones they lead and decides what they may CHANGE
  // (2026-08-13). For a завідувач the two are the same list.
  const [scope, led] = isAdmin
    ? [[], []]
    : await Promise.all([scopeOf(session.user.staffId), headOf(session.user.staffId)]);
  if (!isAdmin && scope.length === 0) notFound();

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

  // ADMIN picks from everything; a head from what they oversee — which is more
  // than one кафедра for a декан, so it is still a list and not an assumption.
  const departments = await listDepartmentStakes(year);
  const available = isAdmin ? departments : departments.filter((x) => scope.includes(x.id));
  if (available.length === 0) notFound();

  const selected = available.find((x) => x.id === d) ?? available[0];
  const departmentId = selected.id;

  // The sandbox is ADMIN's and nobody else's — a head reaching for `?tab=sandbox`
  // simply gets their own кафедра, which is the only thing they came for.
  const sandbox = isAdmin && tab === 'sandbox';
  const scratch = sandbox
    ? await getStakeSandbox(session.user.id, departmentId, year)
    : EMPTY_SANDBOX;

  const [view, settings] = await Promise.all([
    getStakeDistribution(departmentId, year, sandbox ? scratch : null),
    isAdmin ? getStakeYearSettings(year) : null,
  ]);
  if (!view) notFound();

  // The завідувач of THIS кафедра, and only them. A декан reading one of their
  // faculty's кафедри lands here as a viewer, like ADMIN on the real tab.
  const canEditAllocation = led.includes(departmentId) || sandbox;
  const heads = !isAdmin;

  return (
    <AnimatedPage className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-semibold">Розподіл ставок</h1>
          <span className="text-sm text-muted-foreground">{year} рік</span>
        </div>

        {isAdmin && settings && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            {/* University-wide, not per кафедра — which is exactly why it sits
                up here beside the year and not in the кафедра toolbar below.
                It used to be folded into a «Налаштування року» dropdown under
                the grid, where it read as another per-кафедра setting. */}
            <label className="inline-flex items-center gap-2">
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                Узгоджуючий коефіцієнт
                <StakeTermHint term="contractCoefficient" />
              </span>
              <StakeValueForm
                action={setStakeYearSettings}
                hidden={{ year }}
                name="contractCoefficient"
                defaultValue={String(settings.contractCoefficient)}
                ariaLabel="Узгоджуючий коефіцієнт на весь університет"
                className="w-20"
              />
            </label>

            <AllDepartmentsDialog departments={departments} selectedId={departmentId} year={year} />

            <Link
              href="/admin/stakes/norms"
              className="text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              Нормативи →
            </Link>
          </div>
        )}
      </div>

      {/* ── One toolbar: which кафедра, what its pool is, which tab.
             These three used to be three separate bands stacked on top of each
             other, with the кафедра's name repeated as a heading in between.
             They are one decision — «show me this кафедра» — so they are one
             control strip, and the кафедра's figures are its second line. ── */}
      <div className="rounded-xl border bg-card">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          {/* One control for everybody who has a choice — ADMIN across the
              university, a декан across their faculty. The кафедра's own pool
              rides along as a tag; the faculty used to sit there and paid for
              its width badly, repeating down every кафедра of one faculty when
              it already sits on the line below. */}
          {available.length > 1 ? (
            <DepartmentSelect
              departments={available.map((x) => ({
                id: x.id,
                name: x.name,
                tag: x.kstHundredths === null ? 'без Кст' : formatStake(x.kstHundredths),
                tagTone: x.kstHundredths === null || x.belowMinimum ? 'warn' : 'muted',
              }))}
              value={departmentId}
              basePath="/stakes"
              param="d"
              extraParams={sandbox ? { tab: 'sandbox' } : undefined}
              className="w-full sm:w-80"
            />
          ) : (
            <span className="text-sm font-medium">{view.departmentName}</span>
          )}

          <span className="hidden h-6 w-px bg-border sm:block" aria-hidden />

          <label className="inline-flex items-center gap-2 text-sm">
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              Кст
              <StakeTermHint term="kst" />
            </span>
            {isAdmin ? (
              <StakeValueForm
                action={setDepartmentStake}
                hidden={{ departmentId, year }}
                name="kst"
                defaultValue={
                  selected.kstHundredths === null
                    ? ''
                    : String(fromHundredths(selected.kstHundredths)).replace('.', ',')
                }
                // Not the bare minimum: a greyed «1,60» sitting in an empty box
                // reads as a value that is already set.
                placeholder={`мін. ${formatStake(selected.minimumHundredths)}`}
                ariaLabel={`Кст для кафедри ${selected.name}`}
                invalid={selected.belowMinimum}
              />
            ) : (
              // The head sees the pool they are dividing and cannot move it —
              // ADMIN sets it centrally. Shown, because a bound you cannot see
              // is a bound you file a bug about.
              <span className="font-medium tabular-nums">
                {selected.kstHundredths === null
                  ? 'не задано'
                  : formatStake(selected.kstHundredths)}
              </span>
            )}
          </label>

          <div className="ml-auto inline-flex items-center gap-2">
            {/* Shown to anybody who cannot type in «Розподілено» — ADMIN on the
                real tab, and a декан on any кафедра they do not lead. A greyed
                column with no explanation reads as a broken page. */}
            {!canEditAllocation && (
              <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                лише перегляд
                <StakeTermHint term={isAdmin ? 'realReadonly' : 'deanReadonly'} />
              </span>
            )}
            {isAdmin && (
              <div className="inline-flex rounded-lg border p-0.5">
                <TabLink href={`/stakes?d=${departmentId}`} active={!sandbox}>
                  Реальний
                </TabLink>
                <TabLink href={`/stakes?d=${departmentId}&tab=sandbox`} active={sandbox}>
                  Пісочниця
                </TabLink>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-1 border-t px-4 py-2 text-xs text-muted-foreground">
          <strong className="font-medium text-foreground">{view.departmentName}</strong>
          <span>· {view.facultyName}</span>
          <span>· {view.headcount} НПП</span>
          <span className="inline-flex items-center gap-1">
            · ліцензійним умовам відповідають {view.knpp}
            <StakeTermHint term="knpp" />
          </span>
          <span>· середній рейтинг {Math.round(view.averageRating)}</span>
          <span>· мінімальний Кст {formatStake(view.minimumKstHundredths)}</span>
        </div>

        {selected.belowMinimum && (
          // A pool can fall under the floor without anybody touching it —
          // somebody joined the кафедра since it was set.
          <p className="border-t border-destructive/30 bg-destructive/5 px-4 py-2 text-xs text-destructive">
            Кст нижче мінімуму: на кафедрі {selected.headcount} НПП, потрібно щонайменше{' '}
            {formatStake(selected.minimumHundredths)}
          </p>
        )}
      </div>

      {sandbox && (
        <SandboxControls
          departmentId={departmentId}
          year={year}
          kstHundredths={scratch.kstHundredths}
          realKstHundredths={selected.kstHundredths}
          saved={scratch.saved}
        />
      )}

      {/* Folded away. A head reads this once a year and then never again, and
          open by default it cost five lines above the only thing they came
          for. */}
      {view.kstHundredths !== null && view.computable && heads && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer underline-offset-4 hover:underline">
            Як рахується ставка
          </summary>
          <p className="mt-2 max-w-3xl">
            Формула пропонує, скільки дати кожному — частку від виділених ставок, пропорційно до
            рейтингу. Сума майже дорівнює виділеному: різниця в кілька сотих виникає через
            округлення до 0,05. Запропоновану ставку можна лише збільшити. Якщо разом вийде більше
            за виділене, збереження не блокується — але це треба врахувати у протоколі. Бонус за
            залучених здобувачів не входить до виділених ставок, але й не піднімає людину вище її
            Макс. Мінімальну і максимальну ставку встановлює адміністратор.
          </p>
        </details>
      )}

      {/* The key forces the grid to re-read the server's numbers whenever they
          change. The grid keeps the typed values in local state, seeded once
          from `view` — so after ADMIN saves a cap and the route refreshes, «За
          формулою» updated while «Розподілено» and «Нерозподілено» went on
          showing the old totals.

          Remounting is the fix rather than an effect that syncs state: the
          bounds have moved, so every derived figure has to be recomputed, and
          «keep what the user typed unless it conflicts» is a rule with more
          edge cases than the thing it saves. */}
      <DistributionGrid
        key={stateKey(view)}
        view={view}
        canEdit={canEditAllocation}
        canEditLimits={isAdmin}
        canOpenStaffProfile={isAdmin}
        audience={isAdmin ? 'admin' : 'head'}
      />
    </AnimatedPage>
  );
}

function TabLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'rounded-md px-3 py-1 text-sm transition-colors',
        active ? 'bg-muted font-medium' : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {children}
    </Link>
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
    view.departmentId,
    view.sandbox ? 'sandbox' : 'real',
    view.kstHundredths,
    ...view.rows.map((r) =>
      [r.staffId, r.formulaHundredths, r.proposedHundredths, r.minHundredths, r.maxHundredths].join(
        ':'
      )
    ),
  ].join('|');
}
