import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { canActForDivision } from '@/lib/permissions';
import { getActiveScienceTemplate } from '@/lib/queries/get-science-template';
import { listSciencePlans } from '@/lib/queries/list-science-plans';
import { listDepartments } from '@/lib/queries/list-departments';
import { listFaculties } from '@/lib/queries/list-faculties';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { EmptyState } from '@/components/aurora/ui/card';
import { AllPlansView } from '@/components/science/all-plans-view';

const CRUMBS = [{ label: 'Управління' }, { label: 'Наукова робота' }];

/**
 * The ННВ's / ADMIN's read of EVERY кафедра's наукова робота plans — наказ
 * №152 п.3 puts оversight of наукова робота on ННВ, so this is their screen:
 * the university-wide sibling of `/my-department/science-plans` (Task 10),
 * which shows one head's or декан's own кафедри via `scopeOf`.
 *
 * **Access is ADMIN, or an EDITOR whose division IS ННВ** — resolved by
 * `registryKey`, never by name (the name is editable on `/divisions`, and a
 * rename must not silently revoke this). This is deliberately its own check
 * rather than `canModerateRating` (`lib/rating/moderation.ts`): that flag can
 * be GRANTED to some other division for rating moderation, but наукова робота
 * oversight belongs to ННВ specifically by наказ, not to whoever a future
 * ADMIN hands the moderation flag to. The lookup still reuses the existing
 * division-membership mechanism — `getEditorDivisionId` /
 * `canActForDivision` in `lib/permissions.ts`, the same «ADMIN, or exactly
 * this division» check `/division-data` uses — rather than a second raw query.
 *
 * **Read only**, same as Task 10 — records and their moderation are Stage 2.
 */
export default async function AllSciencePlansPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const session = await auth();
  if (!session) redirect('/login');

  const nnv = await db.division.findUnique({
    where: { registryKey: 'NNV' },
    select: { id: true },
  });
  const allowed =
    session.user.role === 'ADMIN' ||
    (nnv !== null && (await canActForDivision(session.user, nnv.id)));
  if (!allowed) redirect('/profile');

  const template = await getActiveScienceTemplate();
  if (!template) {
    return (
      <div className="space-y-5">
        <Breadcrumbs items={CRUMBS} />
        <h1 className="text-2xl font-semibold tracking-[-0.01em]">Наукова робота</h1>
        <EmptyState>Планування наукової роботи на цей рік ще не відкрито.</EmptyState>
      </div>
    );
  }

  const [faculties, departments] = await Promise.all([listFaculties(), listDepartments()]);

  const askedFaculty = typeof params.faculty === 'string' ? params.faculty : undefined;
  const askedDept = typeof params.dept === 'string' ? params.dept : undefined;
  const facultyId =
    askedFaculty && faculties.some((f) => f.id === askedFaculty) ? askedFaculty : '';
  const departmentId = askedDept && departments.some((d) => d.id === askedDept) ? askedDept : '';

  // Rule 3, the exact bug fixed in the rating (audit-2026-08-27, finding #6):
  // a кафедра filter must never be ANDed against a PRIMARY-only факультет
  // condition, because that cancels out every сумісник whose other кафедра
  // sits in a different факультет. `listSciencePlans` takes a department id
  // WHITELIST rather than raw Prisma conditions, so a кафедра choice simply
  // WINS outright — it is never intersected with the факультет at all — and
  // resolving «every кафедра of this факультет» reads `Department.facultyId`,
  // a structural relation with no сумісництво ambiguity (сумісництво is a
  // STAFF↔кафедра fact, not a кафедра↔факультет one; see `onFaculty` in
  // `lib/queries/roster.ts`, whose OR this is exactly equivalent to once
  // `listSciencePlans`'s own `onDepartments` is applied to the result).
  const departmentIds = departmentId
    ? [departmentId]
    : facultyId
      ? departments.filter((d) => d.facultyId === facultyId).map((d) => d.id)
      : departments.map((d) => d.id);

  const rows = await listSciencePlans({ templateId: template.id, departmentIds });

  return (
    <div className="space-y-5">
      <Breadcrumbs items={CRUMBS} />
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.01em]">Наукова робота</h1>
        <p className="mt-0.5 text-sm text-foreground-soft">
          {template.academicYear} навчальний рік · усі кафедри
        </p>
      </div>

      <AllPlansView
        rows={rows}
        faculties={faculties.map((f) => ({ id: f.id, name: f.name }))}
        departments={departments.map((d) => ({ id: d.id, name: d.name, facultyId: d.facultyId }))}
        facultyId={facultyId}
        departmentId={departmentId}
      />
    </div>
  );
}
