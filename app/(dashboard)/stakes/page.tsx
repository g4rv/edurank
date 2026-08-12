import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getActiveTemplate } from '@/lib/queries/get-active-template';
import { getStakeDistribution } from '@/lib/queries/get-stake-distribution';
import { getStakeSandbox, EMPTY_SANDBOX } from '@/lib/queries/get-stake-sandbox';
import { getStakeYearSettings, listDepartmentStakes } from '@/lib/queries/list-stake-settings';
import { scopeOf } from '@/lib/queries/scope';
import { formatStake, fromHundredths } from '@/lib/stake/units';
import { AnimatedPage } from '@/components/ui/animated-page';
import { StakeValueForm } from '@/components/admin/stake-value-form';
import { DistributionGrid } from '@/components/stake/distribution-grid';
import { DepartmentPicker } from '@/components/stake/department-picker';
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
  const scope = isAdmin ? [] : await scopeOf(session.user.staffId);
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

  const heads = !isAdmin;

  return (
    <AnimatedPage className="flex h-full min-h-0 flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Розподіл ставок</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {year} рік · {view.facultyName}
          </p>
        </div>
        {isAdmin && (
          <Link href="/admin/stakes/norms" className="text-sm underline-offset-4 hover:underline">
            Нормативи чисельності →
          </Link>
        )}
      </div>

      {/* ── Which кафедра ── */}
      {isAdmin ? (
        <DepartmentPicker
          departments={available.map((x) => ({ id: x.id, name: x.name, faculty: x.faculty }))}
          value={departmentId}
          tab={sandbox ? 'sandbox' : undefined}
        />
      ) : available.length > 1 ? (
        // A декан oversees several. Tabs rather than a select: there are a
        // handful, and seeing them all is part of the job.
        <div className="flex flex-wrap gap-1">
          {available.map((x) => (
            <Link
              key={x.id}
              href={`/stakes?d=${x.id}`}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm transition-colors',
                x.id === departmentId
                  ? 'bg-muted font-medium'
                  : 'text-muted-foreground hover:bg-muted/50'
              )}
            >
              {x.name}
            </Link>
          ))}
        </div>
      ) : null}

      <div>
        <h2 className="text-lg font-medium">{view.departmentName}</h2>
        <p className="mt-1 inline-flex flex-wrap items-center gap-x-1 text-sm text-muted-foreground">
          {view.headcount} НПП ·{' '}
          <span className="inline-flex items-center gap-1">
            відповідають ліцензійним умовам: {view.knpp}
            <StakeTermHint term="knpp" />
          </span>
          · середній рейтинг {Math.round(view.averageRating)} · мінімальний Кст{' '}
          {formatStake(view.minimumKstHundredths)}
        </p>
      </div>

      {/* ── ADMIN: the pool, and the two tabs ── */}
      {isAdmin && (
        <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
          <div>
            <p className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
              Кст — виділені ставки
              <StakeTermHint term="kst" />
            </p>
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
            {selected.belowMinimum && (
              // A pool can fall under the floor without anybody touching it —
              // somebody joined the кафедра since it was set.
              <p className="mt-1 max-w-md text-xs text-destructive">
                Нижче мінімуму: на кафедрі {selected.headcount} НПП, потрібно щонайменше{' '}
                {formatStake(selected.minimumHundredths)}
              </p>
            )}
          </div>

          <div className="ml-auto inline-flex rounded-lg border bg-card p-1">
            <TabLink href={`/stakes?d=${departmentId}`} active={!sandbox}>
              Реальний
            </TabLink>
            <TabLink href={`/stakes?d=${departmentId}&tab=sandbox`} active={sandbox}>
              Пісочниця
            </TabLink>
          </div>
        </div>
      )}

      {sandbox && (
        <SandboxControls
          departmentId={departmentId}
          year={year}
          kstHundredths={scratch.kstHundredths}
          realKstHundredths={selected.kstHundredths}
          saved={scratch.saved}
          updatedAt={scratch.updatedAt}
        />
      )}

      {isAdmin && !sandbox && (
        <p className="max-w-3xl rounded-lg border bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
          Це те, що зберіг завідувач кафедри — ви бачите його, але не змінюєте. Щоб перевірити, що
          буде за іншого Кст чи інших меж, відкрийте «Пісочницю». Кст, Мін і Макс залишаються вашими
          на обох вкладках.
        </p>
      )}

      {/* The proposal lands ON the pool — each person gets a share of Кст — so
          what is left is a few hundredths of ladder rounding, which is worth
          saying because it is the number in «Нерозподілено». */}
      {view.kstHundredths !== null && view.computable && heads && (
        <p className="max-w-3xl text-xs text-muted-foreground">
          Формула пропонує, скільки дати кожному — частку від виділених ставок, пропорційно до
          рейтингу. Сума майже дорівнює виділеному: різниця в кілька сотих виникає через округлення
          до 0,05. Запропоновану ставку можна лише збільшити. Якщо разом вийде більше за виділене,
          збереження не блокується — але це треба врахувати у протоколі. Бонус за залучених
          здобувачів не входить до виділених ставок, але й не піднімає людину вище її Макс.
        </p>
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
        canEdit={heads || sandbox}
        canEditLimits={isAdmin}
        canOpenStaffProfile={isAdmin}
        audience={isAdmin ? 'admin' : 'head'}
      />

      {/* ── ADMIN: everything else, folded away ── */}
      {isAdmin && settings && (
        <div className="space-y-4">
          <details className="rounded-xl border bg-card">
            <summary className="cursor-pointer px-5 py-3 text-sm font-medium">
              Усі кафедри
              <span className="ml-2 font-normal text-muted-foreground">
                {departments.length} · разом {formatStake(totalKst(departments))}
                {unset(departments) > 0 && ` · без Кст: ${unset(departments)}`}
                {belowMinimum(departments) > 0 && ` · нижче мінімуму: ${belowMinimum(departments)}`}
              </span>
            </summary>
            <div className="overflow-x-auto border-t">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-muted/60 text-left">
                    <th className="border border-border px-3 py-2 font-medium text-muted-foreground">
                      Кафедра
                    </th>
                    <th className="w-20 border border-border px-3 py-2 text-right font-medium text-muted-foreground">
                      НПП
                    </th>
                    <th className="w-20 border border-border px-3 py-2 text-right font-medium text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        Кнпп
                        <StakeTermHint term="knpp" />
                      </span>
                    </th>
                    <th className="w-24 border border-border px-3 py-2 text-right font-medium text-muted-foreground">
                      Мінімум
                    </th>
                    <th className="w-24 border border-border px-3 py-2 text-right font-medium text-muted-foreground">
                      Кст
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {departments.map((x) => (
                    <tr
                      key={x.id}
                      className={cn(
                        'transition-colors hover:bg-muted/20',
                        x.id === departmentId && 'bg-muted/40'
                      )}
                    >
                      <td className="border border-border px-3 py-2">
                        <Link
                          href={`/stakes?d=${x.id}`}
                          className="underline-offset-4 hover:underline"
                        >
                          {x.name}
                        </Link>
                        <span className="ml-2 text-xs text-muted-foreground">{x.faculty}</span>
                      </td>
                      <td className="border border-border px-3 py-2 text-right tabular-nums">
                        {x.headcount}
                      </td>
                      <td className="border border-border px-3 py-2 text-right tabular-nums">
                        {x.knpp}
                      </td>
                      <td
                        className={cn(
                          'border border-border px-3 py-2 text-right tabular-nums',
                          x.belowMinimum ? 'font-medium text-destructive' : 'text-muted-foreground'
                        )}
                      >
                        {formatStake(x.minimumHundredths)}
                      </td>
                      <td
                        className={cn(
                          'border border-border px-3 py-2 text-right tabular-nums',
                          x.kstHundredths === null && 'text-muted-foreground'
                        )}
                      >
                        {x.kstHundredths === null ? 'не задано' : formatStake(x.kstHundredths)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>

          <details className="rounded-xl border bg-card">
            <summary className="cursor-pointer px-5 py-3 text-sm font-medium">
              Налаштування року
              <span className="ml-2 font-normal text-muted-foreground">
                узгоджуючий коефіцієнт {settings.contractCoefficient}
                {!settings.saved && ' — ще не підтверджено'}
              </span>
            </summary>
            <div className="border-t px-5 py-4">
              <p className="mb-3 max-w-2xl text-xs text-muted-foreground">
                Множник для здобувачів, які навчаються за контрактом. Бюджетний здобувач
                зараховується повністю, контрактний — із цим коефіцієнтом. На {year} рік — 0,175.
              </p>
              <StakeValueForm
                action={setStakeYearSettings}
                hidden={{ year }}
                name="contractCoefficient"
                defaultValue={String(settings.contractCoefficient)}
                ariaLabel="Узгоджуючий коефіцієнт"
              />
            </div>
          </details>
        </div>
      )}
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
      className={cn(
        'rounded-md px-4 py-1.5 text-sm transition-colors',
        active ? 'bg-muted font-medium' : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {children}
    </Link>
  );
}

type DepartmentRow = Awaited<ReturnType<typeof listDepartmentStakes>>[number];

const totalKst = (rows: DepartmentRow[]) =>
  rows.reduce((sum, x) => sum + (x.kstHundredths ?? 0), 0);
const unset = (rows: DepartmentRow[]) => rows.filter((x) => x.kstHundredths === null).length;
const belowMinimum = (rows: DepartmentRow[]) => rows.filter((x) => x.belowMinimum).length;

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
