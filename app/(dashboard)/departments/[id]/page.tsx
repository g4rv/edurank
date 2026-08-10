import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Pencil } from 'lucide-react';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { AnimatedPage } from '@/components/ui/animated-page';
import { AnimatedTableBody } from '@/components/ui/animated-table-body';
import { AnimatedRow } from '@/components/ui/animated-row';
import { DeleteDepartmentButton } from '@/components/department/delete-button';
import { RowLinkCell } from '@/components/ui/row-link-cell';
import { cn } from '@/lib/utils';
import { ACADEMIC_RANK_LABELS, SCIENTIFIC_DEGREE_LABELS } from '@/lib/labels';
import { getEditorEntityPermissions } from '@/lib/queries/get-editor-permissions';
import { getActiveTemplate } from '@/lib/queries/get-active-template';
import { getDepartmentKnpp } from '@/lib/queries/get-department-knpp';
import { KnppSummary } from '@/components/kharakterystyka/knpp-summary';

function fullName(p: { lastName: string; firstName: string; patronymic: string }) {
  return `${p.lastName} ${p.firstName} ${p.patronymic}`;
}

export default async function DepartmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session) redirect('/login');

  const role = session.user.role;

  if (role === 'USER') redirect('/profile');

  const department = await db.department.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      faculty: { select: { id: true, name: true } },
      head: { select: { id: true, lastName: true, firstName: true, patronymic: true } },
      primaryStaff: {
        select: {
          id: true,
          lastName: true,
          firstName: true,
          patronymic: true,
          academicRank: true,
          scientificDegree: true,
        },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      },
      partTimeStaff: {
        select: {
          staff: {
            select: {
              id: true,
              lastName: true,
              firstName: true,
              patronymic: true,
              academicRank: true,
              scientificDegree: true,
            },
          },
        },
      },
    },
  });

  if (!department) notFound();

  const isAdmin = role === 'ADMIN';
  let canEdit = isAdmin;
  let canDelete = isAdmin;

  if (!isAdmin && role === 'EDITOR') {
    const perms = await getEditorEntityPermissions(session.user.staffId ?? '', 'DEPARTMENT');
    canEdit = perms.canUpdate;
    canDelete = perms.canDelete;
  }

  // Кнпп needs five years of activities for everyone here, so it is only
  // computed once the page is known to render — after the notFound above.
  const template = await getActiveTemplate();
  const knpp = template ? await getDepartmentKnpp(id, template.year) : null;

  const primaryIds = new Set(department.primaryStaff.map((s) => s.id));
  const allStaff = [
    ...department.primaryStaff.map((s) => ({ ...s, type: 'primary' as const })),
    ...department.partTimeStaff
      .filter((pt) => !primaryIds.has(pt.staff.id))
      .map((pt) => ({ ...pt.staff, type: 'parttime' as const })),
  ];

  return (
    <AnimatedPage className="space-y-6">
      <Link
        href="/departments"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Кафедри
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{department.name}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {department.primaryStaff.length} основних · {department.partTimeStaff.length} сумісників
          </p>
        </div>
        {(canEdit || canDelete) && (
          <div className="flex items-start gap-2">
            {canEdit && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/departments/${id}/edit`}>
                  <Pencil className="size-4" />
                </Link>
              </Button>
            )}
            {canDelete && (
              <DeleteDepartmentButton departmentId={id} departmentName={department.name} />
            )}
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border bg-card p-5">
          <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Факультет
          </p>
          <Link
            href={`/faculties/${department.faculty.id}`}
            className="text-sm font-medium hover:underline"
          >
            {department.faculty.name}
          </Link>
        </div>

        <div className="rounded-xl border bg-card p-5">
          <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Завідувач
          </p>
          {department.head ? (
            <Link
              href={`/staff/${department.head.id}`}
              className="text-sm font-medium hover:underline"
            >
              {fullName(department.head)}
            </Link>
          ) : (
            <p className="text-sm text-muted-foreground">Не призначено</p>
          )}
        </div>
      </div>

      {/* Кнпп and the pool's own minimum — the two ставка inputs this кафедра
          contributes. Only where a rating year exists to measure them over. */}
      {knpp && template && <KnppSummary data={knpp} year={template.year} />}

      {allStaff.length > 0 && (
        <div className="rounded-xl border bg-card">
          <div className="border-b px-4 py-3">
            <p className="text-sm font-medium">Персонал кафедри</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">ПІБ</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Звання / ступінь
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Тип</th>
              </tr>
            </thead>
            <AnimatedTableBody>
              {allStaff.map((member) => (
                <AnimatedRow
                  key={member.id}
                  className="group/row border-b transition-colors last:border-0 hover:bg-muted/30"
                >
                  <RowLinkCell href={`/staff/${member.id}`}>{fullName(member)}</RowLinkCell>
                  <td className="px-4 py-3 text-muted-foreground">
                    {member.academicRank
                      ? [
                          ACADEMIC_RANK_LABELS[member.academicRank],
                          member.scientificDegree
                            ? SCIENTIFIC_DEGREE_LABELS[member.scientificDegree]
                            : null,
                        ]
                          .filter(Boolean)
                          .join(', ')
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                        member.type === 'primary'
                          ? 'bg-primary/10 text-primary'
                          : 'bg-muted text-muted-foreground'
                      )}
                    >
                      {member.type === 'primary' ? 'Основний' : 'Сумісник'}
                    </span>
                  </td>
                </AnimatedRow>
              ))}
            </AnimatedTableBody>
          </table>
        </div>
      )}
    </AnimatedPage>
  );
}
