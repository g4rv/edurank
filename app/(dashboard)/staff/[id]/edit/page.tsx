import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { auth } from '@/lib/auth';
import { getStaff } from '@/lib/queries/get-staff';
import { getStakeBreakdown } from '@/lib/queries/get-stake-breakdown';
import { listDepartments } from '@/lib/queries/list-departments';
import { listDivisions } from '@/lib/queries/list-divisions';
import { getEditorEntityPermissions } from '@/lib/queries/get-editor-permissions';
import {
  canMutateStaffRecord,
  editorHasFieldGrant,
  getDivisionFieldGrants,
  getEditorDivisionId,
  isEditorWritableField,
} from '@/lib/permissions';
import { StaffEditForm } from '@/components/staff/edit-form';

export default async function StaffEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session) redirect('/login');

  const role = session.user.role;
  const isAdmin = role === 'ADMIN';
  const isEditor = role === 'EDITOR';

  if (!isAdmin && !isEditor) redirect(`/staff/${id}`);

  if (isEditor) {
    const perms = await getEditorEntityPermissions(session.user.staffId ?? '', 'STAFF');
    if (!perms.canUpdate) redirect(`/staff/${id}`);
  }

  // The same grant `updateStaff` checks, so «Додаткова кафедра» is offered only
  // to somebody whose save would keep it.
  const canEditPartTime =
    isAdmin || (await editorHasFieldGrant(session.user.staffId, 'partTimeDepartmentIds'));

  /**
   * The whole grant set, for the same reason — every OTHER field needed it too.
   *
   * This rule was applied to `partTimeDepartmentIds` above and to nothing else,
   * so an EDITOR holding STAFF UPDATE was shown the entire form whatever their
   * division was granted. `updateStaff` filtered the write correctly, but a
   * division granted only `orcidId` could retype a surname, get «Збережено»,
   * and leave the record untouched with nothing on screen saying so
   * (2026-08-27).
   *
   * `undefined` for ADMIN — no filtering, and the form treats it as «all».
   * Intersected with `isEditorWritableField`, which is what `updateStaff`
   * applies on top of the grants: a stale or hand-inserted row must not put a
   * confidential or permission-scoping column back on the form.
   */
  const editableFields = isAdmin
    ? undefined
    : [
        ...(await getDivisionFieldGrants((await getEditorDivisionId(session.user.staffId)) ?? '')),
      ].filter(isEditorWritableField);

  const [staff, departments, divisions, stakeBreakdown] = await Promise.all([
    getStaff(id, isAdmin),
    listDepartments(),
    // Only ADMIN may assign a відділ, and the names must not reach anyone else:
    // a prop is serialised into the page payload whether the control that would
    // use it is rendered or not.
    isAdmin ? listDivisions() : Promise.resolve([]),
    // The ставка each кафедра allocated, shown under its own select instead of
    // being typed. Confidential like `employmentRate` itself, so ADMIN only —
    // a prop reaches the page payload whether or not it is rendered.
    isAdmin ? getStakeBreakdown(id) : Promise.resolve([]),
  ]);

  if (!staff) notFound();

  // Whose record it is decides as much as which fields: an editor may edit USER
  // records and their own, never an admin's. updateStaff refuses it anyway —
  // this stops the form being offered at all rather than after it is filled in.
  if (!canMutateStaffRecord(session.user, { id: staff.id, role: staff.role })) {
    redirect(`/staff/${id}`);
  }

  return (
    <div className="max-w-3xl space-y-6">
      <Link
        href={`/staff/${id}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Профіль
      </Link>

      <div>
        <h1 className="text-2xl font-semibold">Редагування</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {staff.lastName} {staff.firstName} {staff.patronymic}
        </p>
      </div>

      <StaffEditForm
        staff={staff}
        departments={departments}
        divisions={divisions}
        isAdmin={isAdmin}
        canEditPartTime={canEditPartTime}
        editableFields={editableFields}
        staffId={id}
        stakeBreakdown={stakeBreakdown}
      />
    </div>
  );
}
