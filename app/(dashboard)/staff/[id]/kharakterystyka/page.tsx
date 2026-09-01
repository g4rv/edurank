import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { getActiveTemplate } from '@/lib/queries/get-active-template';
import { getKharakterystyka, licencePositionSources } from '@/lib/queries/get-kharakterystyka';
import { canViewAcademicRecord } from '@/lib/queries/scope';
import { AnimatedPage } from '@/components/ui/animated-page';
import { StaffTabs } from '@/components/staff/staff-tabs';
import { KharakterystykaTable } from '@/components/kharakterystyka/kharakterystyka-table';
import { DownloadButton } from '@/components/ui/download-button';

/**
 * «Характеристика рівня наукової та професійної активності викладача» — п.38 of
 * the Ліцензійні умови, derived from five years of rating data.
 *
 * Who may open it (settled with the owner 2026-08-10): ADMIN, EDITOR, the
 * завідувач of the person's кафедра (and the декан of its факультет), and the
 * person themselves. `canViewAcademicRecord` holds that rule — it is not a
 * `Role`, because one person is routinely a head, an НПП and an editor at once.
 */
export default async function StaffKharakterystykaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session) redirect('/login');

  // An НПП reaching their own record belongs on «Мій рейтинг», which carries the
  // same document plus the forms to do something about it.
  if (session.user.staffId === id && session.user.role === 'USER') {
    redirect('/achievements/kharakterystyka');
  }
  if (!(await canViewAcademicRecord(session.user, id))) notFound();

  const staff = await db.staff.findUnique({
    where: { id },
    select: { lastName: true, firstName: true, patronymic: true, isNpp: true },
  });
  if (!staff || !staff.isNpp) notFound();

  const template = await getActiveTemplate();
  if (!template) {
    return (
      <AnimatedPage className="space-y-6">
        <div className="rounded-xl border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          Рейтинговий рік ще не налаштовано.
        </div>
      </AnimatedPage>
    );
  }

  // ADMIN alone may type evidence by hand — see the note on the action. Loaded
  // only for them, so nobody else's page carries rows it will not render.
  const canEdit = session.user.role === 'ADMIN';

  const [data, positionSources, manualEntries] = await Promise.all([
    getKharakterystyka(id, template.year),
    licencePositionSources(template.year),
    canEdit
      ? db.kharakterystykaEntry.findMany({
          // MANUAL only: an imported row is replaced wholesale on the next
          // import run, so offering a delete button for one would undo itself.
          where: { staffId: id, source: 'MANUAL' },
          select: { id: true, position: true, group: true, year: true, text: true },
          orderBy: [{ position: 'asc' }, { year: 'desc' }],
        })
      : Promise.resolve([]),
  ]);
  if (!data) notFound();

  // A завідувач is an ordinary USER, so /staff redirects them away — send them
  // back where they actually came from, and drop the tabs they cannot open.
  const seesStaffPages = session.user.role === 'ADMIN' || session.user.role === 'EDITOR';
  const back = seesStaffPages
    ? { href: '/staff', label: 'Персонал' }
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

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            {staff.lastName} {staff.firstName} {staff.patronymic}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Характеристика рівня наукової та професійної активності — {data.from}–{data.to} рр.
          </p>
        </div>
        <DownloadButton
          href={`/api/export/kharakterystyka?year=${template.year}&staffId=${id}`}
          label="Завантажити (Excel)"
          title="Характеристика_РНПАВ у форматі документа"
        />
      </div>

      <StaffTabs staffId={id} active="kharakterystyka" showRating showStaffPages={seesStaffPages} />

      <KharakterystykaTable
        data={data}
        sources={Object.fromEntries(positionSources)}
        editing={canEdit ? { staffId: id, entries: manualEntries } : undefined}
      />
    </AnimatedPage>
  );
}
