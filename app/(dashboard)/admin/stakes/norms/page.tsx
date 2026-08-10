import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { auth } from '@/lib/auth';
import { getActiveTemplate } from '@/lib/queries/get-active-template';
import { getStakeYearSettings, listSpecialityNorms } from '@/lib/queries/list-stake-settings';
import { normFor, studentValue } from '@/lib/stake/norms';
import { formatBonus } from '@/lib/stake/units';
import { AnimatedPage } from '@/components/ui/animated-page';
import { StakeValueForm } from '@/components/admin/stake-value-form';
import { setSpecialityNorm } from '../actions';

/**
 * Додаток 5 — норматив чисельності здобувачів на 1 ставку.
 *
 * ONE editable number per speciality. The four columns the paper form prints
 * are all derived from it (магістр ×0.5, заочна ×4), verified across all 38
 * rows, so they are shown read-only rather than stored: four numbers would be
 * four chances to disagree with each other.
 *
 * The last column is what actually matters to a person — what one recruited
 * student is worth — because a норматив on its own is an abstraction and its
 * effect is backwards: a SMALLER норматив makes each student worth MORE.
 */
export default async function SpecialityNormsPage() {
  const session = await auth();
  if (!session) redirect('/login');
  if (session.user.role !== 'ADMIN') redirect('/dashboard');

  const template = await getActiveTemplate();
  if (!template) {
    return (
      <AnimatedPage className="space-y-6">
        <h1 className="text-2xl font-semibold">Нормативи чисельності</h1>
        <div className="rounded-xl border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          Рейтинговий рік ще не налаштовано.
        </div>
      </AnimatedPage>
    );
  }

  const year = template.year;
  const [norms, settings] = await Promise.all([
    listSpecialityNorms(year),
    getStakeYearSettings(year),
  ]);

  const missing = norms.filter((n) => n.base === null).length;

  return (
    <AnimatedPage className="space-y-6">
      <Link
        href="/admin/stakes"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Розподіл ставок
      </Link>

      <div>
        <h1 className="text-2xl font-semibold">Нормативи чисельності</h1>
        <p className="mt-0.5 max-w-3xl text-sm text-muted-foreground">
          Скільки здобувачів припадає на одну ставку — додаток 5, {year} рік. Вводиться одне число:
          бакалавр, денна форма. Магістратура і заочна форма рахуються від нього автоматично.
        </p>
      </div>

      {missing > 0 && (
        <p className="rounded-lg border border-amber-600/30 bg-amber-600/5 px-4 py-2 text-xs text-amber-700 dark:text-amber-500">
          Без нормативу на {year} рік: {missing}. Здобувач такої спеціальності не додасть ставки,
          доки норматив не вказано.
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted/60 text-left">
              <th className="border border-border px-3 py-2 font-medium text-muted-foreground">
                Спеціальність
              </th>
              <th className="w-56 border border-border px-3 py-2 font-medium text-muted-foreground">
                Бакалавр, денна
              </th>
              <th className="w-28 border border-border px-3 py-2 text-right font-medium text-muted-foreground">
                Магістр, денна
              </th>
              <th className="w-28 border border-border px-3 py-2 text-right font-medium text-muted-foreground">
                Бакалавр, заочна
              </th>
              <th className="w-28 border border-border px-3 py-2 text-right font-medium text-muted-foreground">
                Магістр, заочна
              </th>
              <th className="w-40 border border-border px-3 py-2 text-right font-medium text-muted-foreground">
                Ставка за 1 здобувача
              </th>
            </tr>
          </thead>
          <tbody>
            {norms.map((n) => (
              <tr key={n.id} className="transition-colors hover:bg-muted/20">
                <td className="border border-border px-3 py-2">{n.name}</td>
                <td className="border border-border px-3 py-2">
                  <StakeValueForm
                    action={setSpecialityNorm}
                    hidden={{ specialityId: n.id, year }}
                    name="base"
                    defaultValue={n.base === null ? '' : decimal(n.base)}
                    suffix="осіб"
                    ariaLabel={`Норматив для спеціальності ${n.name}`}
                    invalid={n.base === null}
                  />
                </td>
                <Derived base={n.base} degree="MASTER" form="FULL_TIME" />
                <Derived base={n.base} degree="BACHELOR" form="PART_TIME" />
                <Derived base={n.base} degree="MASTER" form="PART_TIME" />
                <td className="border border-border px-3 py-2 text-right text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                  {n.base === null ? (
                    '—'
                  ) : (
                    <>
                      {/* Бакалавр/денна, the commonest case — бюджет and контракт
                          side by side, since the coefficient's effect is the
                          thing people most often ask about. */}
                      <span title="Бакалавр, денна, бюджет">
                        {formatBonus(
                          studentValue(
                            n.base,
                            'BACHELOR',
                            'FULL_TIME',
                            'STATE',
                            settings.contractCoefficient
                          )
                        )}
                      </span>
                      {' / '}
                      <span title="Бакалавр, денна, контракт">
                        {formatBonus(
                          studentValue(
                            n.base,
                            'BACHELOR',
                            'FULL_TIME',
                            'CONTRACT',
                            settings.contractCoefficient
                          )
                        )}
                      </span>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        «Ставка за 1 здобувача» — бюджет / контракт, для бакалавра денної форми. Менший норматив
        означає більшу ставку за кожного здобувача.
      </p>
    </AnimatedPage>
  );
}

/** Ukrainian decimal comma — «10,5», not «10.5», to match every other number here */
function decimal(value: number): string {
  return String(value).replace('.', ',');
}

/** A derived column — read-only, because it is computed from the base beside it */
function Derived({
  base,
  degree,
  form,
}: {
  base: number | null;
  degree: 'BACHELOR' | 'MASTER';
  form: 'FULL_TIME' | 'PART_TIME';
}) {
  return (
    <td className="border border-border px-3 py-2 text-right text-muted-foreground tabular-nums">
      {base === null ? '—' : decimal(normFor(base, degree, form))}
    </td>
  );
}
