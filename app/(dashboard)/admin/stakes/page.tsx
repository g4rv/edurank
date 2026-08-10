import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getActiveTemplate } from '@/lib/queries/get-active-template';
import { getStakeYearSettings, listDepartmentStakes } from '@/lib/queries/list-stake-settings';
import { formatStake, fromHundredths } from '@/lib/stake/units';
import { AnimatedPage } from '@/components/ui/animated-page';
import { StakeValueForm } from '@/components/admin/stake-value-form';
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
          <h2 className="text-sm font-semibold">Кст — пул ставок по кафедрах</h2>
          <p className="mt-1 max-w-3xl text-xs text-muted-foreground">
            Пул, який завідувач розподіляє між НПП кафедри. Мінімум — 0,10 на кожного НПП: пул,
            менший за це, не покриє мінімальну ставку для всіх, тому його не можна зберегти. Кнпп
            впливає лише на формулу і не обмежує пул.
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
                  Кнпп
                </th>
                <th className="w-24 border border-border px-3 py-2 text-right font-medium text-muted-foreground">
                  Мінімум
                </th>
                <th className="w-64 border border-border px-3 py-2 font-medium text-muted-foreground">
                  Кст
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
                    <Link
                      href={`/departments/${d.id}/stakes`}
                      className="ml-2 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                    >
                      розподіл →
                    </Link>
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
                </tr>
              ))}
              {departments.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
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
