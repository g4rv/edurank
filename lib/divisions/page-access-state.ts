import { cache } from 'react';
import { db } from '@/lib/db';
import type { Role } from '@/lib/generated/prisma/client';
import {
  ALL_PAGES,
  NO_PAGES,
  divisionPageAccess,
  type DivisionRights,
  type PageAccess,
} from './page-access';

/**
 * The pages the signed-in user may open — the one question every page, tab,
 * export and nav link asks (owner, 2026-11-25). The rule is in
 * `./page-access.ts`; this only reads the user's division.
 *
 * ADMIN opens everything; a USER none of the five (their own record, and what a
 * завідувач / декан / заступник sees, are decided elsewhere and are not
 * touched by this). An EDITOR opens what their division's switches and rights
 * say.
 */
export async function pageAccessFor(user: {
  role: Role;
  staffId?: string | null;
}): Promise<PageAccess> {
  if (user.role === 'ADMIN') return ALL_PAGES;
  if (user.role !== 'EDITOR' || !user.staffId) return NO_PAGES;
  return editorPageAccess(user.staffId);
}

/** The select that gives a division's switches and rights */
export const DIVISION_RIGHTS_SELECT = {
  canViewStaff: true,
  canViewDepartments: true,
  canViewFaculties: true,
  canViewRating: true,
  canViewCharts: true,
  canModerateRating: true,
  canOverseeScience: true,
  canViewQualifications: true,
  canInviteStaff: true,
  canSetPasswords: true,
  canEndSessions: true,
  entityPermissions: { select: { entity: true } },
  _count: { select: { fieldPermissions: true } },
} as const;

interface DivisionRightsRow {
  canViewStaff: boolean;
  canViewDepartments: boolean;
  canViewFaculties: boolean;
  canViewRating: boolean;
  canViewCharts: boolean;
  canModerateRating: boolean;
  canOverseeScience: boolean;
  canViewQualifications: boolean;
  canInviteStaff: boolean;
  canSetPasswords: boolean;
  canEndSessions: boolean;
  entityPermissions: { entity: string }[];
  _count: { fieldPermissions: number };
}

/** A division row, read with `DIVISION_RIGHTS_SELECT`, as the rule's input */
export function divisionRightsOf(row: DivisionRightsRow): DivisionRights {
  const entities = new Set(row.entityPermissions.map((p) => p.entity));
  return {
    switches: {
      staff: row.canViewStaff,
      departments: row.canViewDepartments,
      faculties: row.canViewFaculties,
      rating: row.canViewRating,
      charts: row.canViewCharts,
    },
    staffEntity: entities.has('STAFF'),
    departmentEntity: entities.has('DEPARTMENT'),
    facultyEntity: entities.has('FACULTY'),
    fieldGrants: row._count.fieldPermissions > 0,
    accountSwitches: row.canInviteStaff || row.canSetPasswords || row.canEndSessions,
    canViewQualifications: row.canViewQualifications,
    canOverseeScience: row.canOverseeScience,
    canModerateRating: row.canModerateRating,
  };
}

/** Once per request: the layout, the page and its links all ask */
const editorPageAccess = cache(async (staffId: string): Promise<PageAccess> => {
  const staff = await db.staff.findUnique({
    where: { id: staffId },
    select: { division: { select: DIVISION_RIGHTS_SELECT } },
  });
  if (!staff?.division) return NO_PAGES;
  return divisionPageAccess(divisionRightsOf(staff.division));
});
