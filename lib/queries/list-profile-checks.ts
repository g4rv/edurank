import { db } from '@/lib/db';
import { ON_ROSTER, onDepartment } from '@/lib/queries/roster';
import {
  PLATFORMS,
  type Check,
  type Platform,
  type PlatformStatus,
} from '@/lib/profile-check/types';

export interface PlatformCell {
  status: PlatformStatus;
  link: string | null;
  error: string | null;
  checks: Check[];
  checkedAt: string;
}

export interface ProfileCheckRow {
  staffId: string;
  name: string;
  faculty: string | null;
  department: string | null;
  /** Missing = never checked */
  cells: Partial<Record<Platform, PlatformCell>>;
  problem: boolean;
}

const PROBLEM: ReadonlySet<string> = new Set(['error', 'warning', 'failed']);

/**
 * Everyone who has a stored result, with a cell per platform. `problem` is the
 * filter «show only who needs attention»: any platform in error, warning or
 * failed. `not_implemented` and `no_link` are not problems.
 */
export async function listProfileChecks({ departmentId }: { departmentId?: string } = {}): Promise<
  ProfileCheckRow[]
> {
  const staff = await db.staff.findMany({
    where: {
      ...ON_ROSTER,
      isNpp: true,
      profileChecks: { some: {} },
      ...(departmentId ? onDepartment(departmentId) : {}),
    },
    select: {
      id: true,
      lastName: true,
      firstName: true,
      patronymic: true,
      department: { select: { name: true, faculty: { select: { name: true } } } },
      partTimeDepartments: {
        select: { department: { select: { name: true, faculty: { select: { name: true } } } } },
        take: 1,
      },
      profileChecks: true,
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });

  return staff.map((s) => {
    const dept = s.department ?? s.partTimeDepartments[0]?.department ?? null;
    const cells: ProfileCheckRow['cells'] = {};
    for (const c of s.profileChecks) {
      if (!(PLATFORMS as readonly string[]).includes(c.platform)) continue;
      cells[c.platform as Platform] = {
        status: c.status as PlatformStatus,
        link: c.link,
        error: c.error,
        checks: c.checks as unknown as Check[],
        checkedAt: c.checkedAt.toISOString(),
      };
    }
    return {
      staffId: s.id,
      name: [s.lastName, s.firstName, s.patronymic].filter(Boolean).join(' '),
      faculty: dept?.faculty.name ?? null,
      department: dept?.name ?? null,
      cells,
      problem: Object.values(cells).some((c) => PROBLEM.has(c.status)),
    };
  });
}
