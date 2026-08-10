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
    <AnimatedPage className="space-y-6">
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

      {/* The formula rarely spends the pool exactly: Σ(R/<R>) is the headcount,
          so its total comes to 0.5 × N / Кнпп × Кст. Said plainly here, because
          otherwise it looks like an arithmetic bug the first time it is seen. */}
      {view.kstHundredths !== null && view.computable && (
        <p className="max-w-3xl text-xs text-muted-foreground">
          Формула пропонує, скільки дати кожному — пропорційно до рейтингу. Її сума майже ніколи не
          дорівнює виділеним ставкам: це властивість формули, а не помилка. Різницю закриває
          завідувач вручну, вказуючи обґрунтування. Бонус за залучених здобувачів виплачується понад
          виділені ставки.
        </p>
      )}

      <DistributionGrid view={view} canEdit={heads} canEditLimits={isAdmin} />
    </AnimatedPage>
  );
}
