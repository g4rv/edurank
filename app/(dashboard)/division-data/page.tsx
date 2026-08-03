import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getEditorDivisionId } from '@/lib/permissions';
import { getActiveTemplate } from '@/lib/queries/get-active-template';
import {
  listEntryDivisions,
  listDivisionActivityTypes,
  listDivisionEntries,
  listNppForRating,
} from '@/lib/queries/list-division-data';
import { AnimatedPage } from '@/components/ui/animated-page';
import { DivisionSelect } from '@/components/rating/division-select';
import { DivisionEntryGrid, type EntryGridCell } from '@/components/rating/division-entry-grid';
import { EntityEntryDialog } from '@/components/rating/entity-entry-dialog';
import type { EvidenceField } from '@/lib/rating/evidence-fields';
import { evidenceFieldsSpecSchema } from '@/validations/activity-type-spec';

/** Field specs off the row's JSON; a malformed row degrades to an empty form */
function fieldsOf(activityType: { evidenceFields: unknown }): EvidenceField[] {
  const parsed = evidenceFieldsSpecSchema.safeParse(activityType.evidenceFields);
  return parsed.success ? parsed.data : [];
}

function EmptyState({ message }: { message: string }) {
  return (
    <AnimatedPage className="space-y-6">
      <h1 className="text-2xl font-semibold">Дані відділу</h1>
      <div className="rounded-xl border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
        {message}
      </div>
    </AnimatedPage>
  );
}

export default async function DivisionDataPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const query = await searchParams;
  const session = await auth();
  if (!session) redirect('/login');
  if (session.user.role === 'USER') redirect('/profile');

  const divisions = await listEntryDivisions();

  // EDITOR always works in their own division; ADMIN picks one
  let divisionId: string | undefined;
  if (session.user.role === 'ADMIN') {
    const param = typeof query.division === 'string' ? query.division : undefined;
    divisionId = divisions.some((d) => d.id === param) ? param : divisions[0]?.id;
  } else {
    const own = await getEditorDivisionId(session.user.staffId);
    if (!own || !divisions.some((d) => d.id === own)) {
      return <EmptyState message="Ваш відділ не веде показників рейтингу." />;
    }
    divisionId = own;
  }

  const template = await getActiveTemplate();
  if (!template || !divisionId) {
    return <EmptyState message="Рейтинговий рік ще не налаштовано." />;
  }

  const division = divisions.find((d) => d.id === divisionId)!;
  const yearOpen = template.status === 'OPEN';

  const [types, staff, entries] = await Promise.all([
    listDivisionActivityTypes(divisionId),
    listNppForRating(),
    listDivisionEntries(divisionId, template.year),
  ]);

  const entryMap: Record<string, EntryGridCell> = {};
  for (const e of entries) {
    entryMap[`${e.staffId}:${e.activityTypeId}`] = {
      id: e.id,
      score: e.score,
      evidence: e.evidence,
    };
  }

  const gridTypes = types.map((t) => ({
    id: t.id,
    code: t.code,
    entityFirstEntry: t.entityFirstEntry,
    itemNumber: t.itemNumber,
    label: t.label,
    coefficientNote: t.coefficientNote,
    fields: fieldsOf(t),
  }));
  const gridStaff = staff.map((s) => ({
    id: s.id,
    name: `${s.lastName} ${s.firstName} ${s.patronymic}`,
    department: s.department?.name ?? '',
  }));
  // The indicator row decides, not a list of codes here
  const entityTypes = gridTypes.filter((t) => t.entityFirstEntry);

  return (
    <AnimatedPage className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Дані відділу</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {division.name} — {template.year} рік
            {!yearOpen && ' (рік закрито, лише перегляд)'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {yearOpen && entityTypes.length > 0 && (
            <EntityEntryDialog types={entityTypes} staff={gridStaff} />
          )}
          {session.user.role === 'ADMIN' && divisions.length > 1 && (
            <DivisionSelect divisions={divisions} value={divisionId} />
          )}
        </div>
      </div>

      <DivisionEntryGrid
        types={gridTypes}
        staff={gridStaff}
        entries={entryMap}
        readOnly={!yearOpen}
      />
    </AnimatedPage>
  );
}
