import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { listDepartments } from '@/lib/queries/list-departments';
import { listDivisions } from '@/lib/queries/list-divisions';
import { editorHasFieldGrant } from '@/lib/permissions';
import { StaffCreateForm } from '@/components/staff/create-form';

export default async function StaffNewPage() {
  const session = await auth();
  if (!session) redirect('/login');

  const role = session.user.role;
  const isAdmin = role === 'ADMIN';

  const [departments, divisions] = await Promise.all([
    listDepartments(),
    // Only ADMIN may assign a відділ, and the names must not reach anyone else:
    // a prop is serialised into the page payload whether the control that would
    // use it is rendered or not.
    isAdmin ? listDivisions() : Promise.resolve([]),
  ]);

  if (!isAdmin) {
    if (role !== 'EDITOR') redirect('/staff');

    const editorStaff = await db.staff.findUnique({
      where: { id: session.user.staffId ?? '' },
      select: { divisionId: true },
    });

    const hasPermission = editorStaff?.divisionId
      ? await db.divisionEntityPermission.findFirst({
          where: {
            divisionId: editorStaff.divisionId,
            entity: 'STAFF',
            action: 'CREATE',
          },
        })
      : null;

    if (!hasPermission) redirect('/staff');
  }

  // `createStaff` deliberately does not consult the field grants — STAFF CREATE
  // authorises the record and the ordinary data on it, and applying the grants
  // there would stop an editor filling in a name they are allowed to create.
  // The control still follows the grant, so the same division sees the same
  // field on both forms rather than one that appears only when creating.
  const canEditPartTime =
    isAdmin || (await editorHasFieldGrant(session.user.staffId, 'partTimeDepartmentIds'));

  return (
    <div className="max-w-3xl space-y-6">
      <Link
        href="/staff"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Співробітники
      </Link>

      <div>
        <h1 className="text-2xl font-semibold">Новий співробітник</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Заповніть дані нового запису</p>
      </div>

      <StaffCreateForm
        departments={departments}
        divisions={divisions}
        isAdmin={isAdmin}
        canEditPartTime={canEditPartTime}
      />
    </div>
  );
}
