import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { getActiveTemplate } from '@/lib/queries/get-active-template';
import { getKharakterystyka, licencePositionSources } from '@/lib/queries/get-kharakterystyka';
import { canViewAcademicRecord } from '@/lib/queries/scope';
import { EmptyState } from '@/components/aurora/ui/card';
import {
  KharakterystykaTable,
  KharakterystykaSummary,
} from '@/components/kharakterystyka/kharakterystyka-table';
import { RecordToolbar, ToolbarGroup, ToolbarDivider } from '@/components/staff/record-toolbar';
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
      <div>
        <EmptyState>Рейтинговий рік ще не налаштовано.</EmptyState>
      </div>
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* «8 з 20 · Відповідає» belongs on the tab row: it says WHAT you are
          looking at rather than being part of the document. Published from here
          rather than fetched by the layout — it is five years of activities put
          through the builder, and the layout would load it on every tab. */}
      <RecordToolbar>
        <ToolbarGroup>
          <KharakterystykaSummary data={data} />
          <ToolbarDivider />
          <DownloadButton
            href={`/api/export/kharakterystyka?year=${template.year}&staffId=${id}`}
            label="Вивантажити Excel"
            title="Характеристика_РНПАВ у форматі документа"
            variant="ghost"
          />
        </ToolbarGroup>
      </RecordToolbar>

      <KharakterystykaTable
        data={data}
        sources={Object.fromEntries(positionSources)}
        editing={canEdit ? { staffId: id, entries: manualEntries } : undefined}
        fill
      />
    </div>
  );
}
