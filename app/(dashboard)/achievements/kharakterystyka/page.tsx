import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getStaff } from '@/lib/queries/get-staff';
import { getActiveTemplate } from '@/lib/queries/get-active-template';
import { getKharakterystyka } from '@/lib/queries/get-kharakterystyka';
import { AnimatedPage } from '@/components/ui/animated-page';
import { KharakterystykaTable } from '@/components/kharakterystyka/kharakterystyka-table';
import { DownloadButton } from '@/components/ui/download-button';

/**
 * The НПП's own Характеристика.
 *
 * They see it because seeing which of the twenty positions they are short of is
 * the clearest reason anybody has to keep the rating filled in — and adoption,
 * not the engine, is this project's stated biggest risk. It is read-only for
 * exactly the reason the whole document is: generated text is never editable,
 * so it always reflects what the rating actually holds.
 *
 * This route is a static segment beside `[section]`, which only accepts 1–5, so
 * the two cannot collide.
 */
export default async function MyKharakterystykaPage() {
  const session = await auth();
  if (!session) redirect('/login');

  const staffId = session.user.staffId;
  if (!staffId || session.user.role !== 'USER') redirect('/profile');

  const staff = await getStaff(staffId, true);
  if (!staff?.isNpp) redirect('/profile');

  const template = await getActiveTemplate();
  if (!template) {
    return (
      <AnimatedPage className="space-y-6">
        <h1 className="text-2xl font-semibold">Моя характеристика</h1>
        <div className="rounded-xl border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          Рейтинговий рік ще не налаштовано. Зверніться до адміністратора.
        </div>
      </AnimatedPage>
    );
  }

  const data = await getKharakterystyka(staffId, template.year);
  if (!data) redirect('/profile');

  return (
    <AnimatedPage className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Моя характеристика</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Рівень наукової та професійної активності за {data.from}–{data.to} рр. Заповнюється
            автоматично з ваших досягнень.
          </p>
        </div>
        <DownloadButton
          href={`/api/export/kharakterystyka?year=${template.year}&staffId=${staffId}`}
          label="Завантажити (Excel)"
          title="Характеристика_РНПАВ у форматі документа"
        />
      </div>

      <KharakterystykaTable data={data} />
    </AnimatedPage>
  );
}
