import Link from 'next/link';
import { SlidersHorizontal } from 'lucide-react';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getActiveTemplate } from '@/lib/queries/get-active-template';
import { getStakeYearSettings, listDepartmentStakes } from '@/lib/queries/list-stake-settings';
import { formatStake, fromHundredths } from '@/lib/stake/units';
import { AnimatedPage } from '@/components/ui/animated-page';
import { Button } from '@/components/ui/button';
import { StakeValueForm } from '@/components/admin/stake-value-form';
import { StakeTermHint } from '@/components/stake/stake-term-hint';
import { setDepartmentStake, setStakeYearSettings } from './actions';
import { cn } from '@/lib/utils';

/**
 * Розподіл ставок — the settings ADMIN owns.
 *
 * `Кст` is set centrally and never by a завідувач: the head divides what they
 * are given, which is the whole reason their own edits can be bounded.
 *
 * Every pool is shown beside its own minimum, because the two only make sense
 * together. In the 2025 file a кафедра with `Кст = 0` and a кафедра nobody had
 * filled in looked identical, and both zeroed everyone on them.
 */
export default async function StakeSettingsPage() {
  const session = await auth();
  if (!session) redirect('/login');
  if (session.user.role !== 'ADMIN') redirect('/dashboard');

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
  const [settings, departments] = await Promise.all([
    getStakeYearSettings(year),
    listDepartmentStakes(year),
  ]);

  const totalKst = departments.reduce((sum, d) => sum + (d.kstHundredths ?? 0), 0);
  const unset = departments.filter((d) => d.kstHundredths === null).length;
  const belowMinimum = departments.filter((d) => d.belowMinimum).length;

  return (
    <AnimatedPage className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Розподіл ставок</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {year} рік — налаштування, які затверджує вчена рада
          </p>
        </div>
        <Link href="/admin/stakes/norms" className="text-sm underline-offset-4 hover:underline">
          Нормативи чисельності →
        </Link>
      </div>

      {/* ── The year's coefficient ── */}
      <section className="rounded-xl border bg-card p-5">
        <h2 className="text-sm font-semibold">Узгоджуючий коефіцієнт</h2>
        <p className="mt-1 mb-3 max-w-2xl text-xs text-muted-foreground">
          Множник для здобувачів, які навчаються за контрактом. Бюджетний здобувач зараховується
          повністю, контрактний — із цим коефіцієнтом. На {year} рік — 0,175.
          {!settings.saved && ' Значення ще не підтверджено для цього року.'}
        </p>
        <StakeValueForm
          action={setStakeYearSettings}
          hidden={{ year }}
          name="contractCoefficient"
          defaultValue={String(settings.contractCoefficient)}
          ariaLabel="Узгоджуючий коефіцієнт"
        />
      </section>

      {/* ── Кст per кафедра ── */}
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Кст — виділені ставки по кафедрах</h2>
          <p className="mt-1 max-w-3xl text-xs text-muted-foreground">
            <strong>Кст</strong> — ставки, виділені кафедрі, які завідувач розподіляє між своїми
            НПП. Мінімум — 0,10 на кожного НПП: менше виділити не можна, інакше не всім вистачить на
            мінімальну ставку. <strong>Кнпп</strong> — скільки НПП відповідають ліцензійним умовам
            (4+ позиції з 20); це лише дільник у формулі, ставку отримують усі.
          </p>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-lg border bg-muted/30 px-4 py-2 text-xs">
          <span>
            Разом розподілено: <strong className="tabular-nums">{formatStake(totalKst)}</strong>
          </span>
          {unset > 0 && <span className="text-muted-foreground">Без Кст: {unset}</span>}
          {belowMinimum > 0 && (
            <span className="text-destructive">Нижче мінімуму: {belowMinimum}</span>
          )}
        </div>

        <div className="overflow-x-auto rounded-xl border bg-card">
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
                <th className="w-64 border border-border px-3 py-2 font-medium text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    Кст
                    <StakeTermHint term="kst" />
                  </span>
                </th>
                <th className="w-40 border border-border px-3 py-2 font-medium text-muted-foreground">
                  Розподіл
                </th>
              </tr>
            </thead>
            <tbody>
              {departments.map((d) => (
                <tr key={d.id} className="transition-colors hover:bg-muted/20">
                  <td className="border border-border px-3 py-2">
                    <Link
                      href={`/departments/${d.id}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {d.name}
                    </Link>
                    <span className="ml-2 text-xs text-muted-foreground">{d.faculty}</span>
                  </td>
                  <td className="border border-border px-3 py-2 text-right tabular-nums">
                    {d.headcount}
                  </td>
                  <td className="border border-border px-3 py-2 text-right tabular-nums">
                    {d.knpp}
                  </td>
                  <td
                    className={cn(
                      'border border-border px-3 py-2 text-right tabular-nums',
                      d.belowMinimum ? 'font-medium text-destructive' : 'text-muted-foreground'
                    )}
                  >
                    {formatStake(d.minimumHundredths)}
                  </td>
                  <td className="border border-border px-3 py-2">
                    <StakeValueForm
                      action={setDepartmentStake}
                      hidden={{ departmentId: d.id, year }}
                      name="kst"
                      defaultValue={
                        d.kstHundredths === null
                          ? ''
                          : String(fromHundredths(d.kstHundredths)).replace('.', ',')
                      }
                      // Not the bare minimum: a greyed «1,60» sitting in an
                      // empty box reads as a value that is already set, and the
                      // «Без Кст» counter was the only thing saying otherwise.
                      placeholder={`мін. ${formatStake(d.minimumHundredths)}`}
                      ariaLabel={`Кст для кафедри ${d.name}`}
                      invalid={d.belowMinimum}
                    />
                    {d.belowMinimum && (
                      // A pool can fall under the floor without anybody touching
                      // it — somebody joined the кафедра since it was set.
                      <p className="mt-1 text-xs text-destructive">
                        Нижче мінімуму: на кафедрі {d.headcount} НПП, потрібно щонайменше{' '}
                        {formatStake(d.minimumHundredths)}
                      </p>
                    )}
                  </td>
                  <td className="border border-border px-3 py-2">
                    {/* A кафедра with no pool has nothing to spread, so the
                        button says why instead of leading to a grid whose Save
                        is disabled for a reason nobody explained. */}
                    {d.kstHundredths === null ? (
                      <span className="text-xs text-muted-foreground">Спочатку вкажіть Кст</span>
                    ) : (
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/departments/${d.id}/stakes`}>
                          <SlidersHorizontal className="size-4" />
                          Розподілити
                        </Link>
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {departments.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="border border-border px-3 py-10 text-center text-muted-foreground"
                  >
                    Кафедр ще немає
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </AnimatedPage>
  );
}
