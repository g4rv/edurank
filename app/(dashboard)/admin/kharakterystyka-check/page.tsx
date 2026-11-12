import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { activeYear } from '@/lib/queries/get-active-template';
import { listYearCheck } from '@/lib/queries/list-kharakterystyka-year-check';
import { windowFor } from '@/lib/kharakterystyka/positions';
import { EmptyState } from '@/components/aurora/ui/card';
import { LinkTabs } from '@/components/aurora/ui/link-tabs';
import { YearCheckList } from '@/components/admin/kharakterystyka-year-check';

/**
 * «Перевірка років публікацій» (owner, 2026-11-12) — the Характеристика lists
 * publications that came out before the five-year window. The ЄДЕБО extraction
 * copies every document whole, and the filling is frozen, so these are taken out
 * here rather than left for people to fix.
 *
 * ADMIN only. Reached by its address — it is a clean-up tool, not a daily screen,
 * so it has no place in the sidebar.
 */
export default async function KharakterystykaCheckPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();
  if (!session) redirect('/login');
  if (session.user.role !== 'ADMIN') redirect('/');

  const { tab } = await searchParams;
  const mode = tab === 'hidden' ? 'hidden' : tab === 'duplicates' ? 'duplicates' : 'suspects';

  const lastYear = await activeYear();
  if (lastYear === null) {
    return <EmptyState>Рейтинговий рік ще не налаштовано.</EmptyState>;
  }
  const window = windowFor(lastYear);
  const { suspects, duplicates, hidden } = await listYearCheck(lastYear);
  const rows = mode === 'hidden' ? hidden : mode === 'duplicates' ? duplicates : suspects;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Перевірка років публікацій</h1>
        <p className="mt-0.5 max-w-3xl text-sm text-foreground-soft">
          Характеристика враховує лише п’ять років: {window.from}–{window.to}, і кожну роботу один
          раз. «Підозрілі» — записи, у бібліографічному описі яких названо рік публікації до{' '}
          {window.from}. «Дублікати» — записи, додані вручну, які вже є в рейтингу тієї самої
          людини. Оберіть записи та приховайте їх: з характеристики й Excel вони зникнуть, але
          лишаться у «Прихованих» із причиною, і їх можна повернути.
        </p>
      </div>

      <LinkTabs
        tabs={[
          {
            href: '/admin/kharakterystyka-check',
            label: 'Підозрілі',
            active: mode === 'suspects',
            count: suspects.length,
          },
          {
            href: '/admin/kharakterystyka-check?tab=duplicates',
            label: 'Дублікати',
            active: mode === 'duplicates',
            count: duplicates.length,
          },
          {
            href: '/admin/kharakterystyka-check?tab=hidden',
            label: 'Приховані',
            active: mode === 'hidden',
            count: hidden.length,
          },
        ]}
      />

      <YearCheckList key={mode} mode={mode} rows={rows} windowFrom={window.from} />
    </div>
  );
}
