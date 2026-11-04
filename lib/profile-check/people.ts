import type { PrismaClient } from '@/lib/generated/prisma/client';
import { ON_ROSTER, onDepartment } from '@/lib/queries/roster';
import type { PersonInput } from '@/lib/profile-check/types';

/**
 * The people a run covers: active НПП with at least one profile given —
 * optionally narrowed to one кафедра and/or an explicit list of ids (the
 * admin page re-checks exactly what its filters show).
 *
 * Takes the client as an argument so the admin page (the app's `db`) and the
 * command-line script (its own client) read the same list.
 */
export async function listPeopleToCheck(
  client: Pick<PrismaClient, 'staff'>,
  {
    staffId,
    staffIds,
    departmentId,
    limit,
  }: { staffId?: string; staffIds?: string[]; departmentId?: string; limit?: number } = {}
): Promise<PersonInput[]> {
  const staff = await client.staff.findMany({
    where: {
      ...ON_ROSTER,
      isNpp: true,
      ...(staffId ? { id: staffId } : staffIds ? { id: { in: staffIds } } : {}),
      // AND, not two `OR` keys: the кафедра's own OR would overwrite the links'
      AND: [
        {
          OR: [
            { orcidId: { not: null } },
            { wosUrl: { not: null } },
            { scopusUrl: { not: null } },
            { googleScholarUrl: { not: null } },
          ],
        },
        ...(departmentId ? [onDepartment(departmentId)] : []),
      ],
    },
    select: {
      id: true,
      lastName: true,
      firstName: true,
      patronymic: true,
      orcidId: true,
      wosUrl: true,
      scopusUrl: true,
      googleScholarUrl: true,
      department: { select: { name: true, faculty: { select: { name: true } } } },
      partTimeDepartments: {
        select: { department: { select: { name: true, faculty: { select: { name: true } } } } },
        take: 1,
      },
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    take: limit,
  });

  return staff.map((s) => {
    // A сумісник with no primary кафедра is shown under the additional one
    const dept = s.department ?? s.partTimeDepartments[0]?.department ?? null;
    return {
      staffId: s.id,
      name: [s.lastName, s.firstName, s.patronymic].filter(Boolean).join(' '),
      faculty: dept?.faculty.name ?? null,
      department: dept?.name ?? null,
      links: {
        orcid: s.orcidId,
        wos: s.wosUrl,
        scopus: s.scopusUrl,
        googleScholar: s.googleScholarUrl,
      },
    };
  });
}
