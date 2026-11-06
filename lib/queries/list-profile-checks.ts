import { db } from '@/lib/db';
import { nameSearch } from '@/lib/queries/name-search';
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
  /** The profile links the person has entered, per platform — null where none */
  links: Record<Platform, string | null>;
  problem: boolean;
  /** The platforms on which this person has a problem */
  problemPlatforms: Platform[];
}

const PROBLEM: ReadonlySet<string> = new Set(['error', 'warning', 'failed']);

/**
 * Every active НПП (owner, 2026-11-06 — it used to be only those with a stored
 * result, so a fresh database showed a handful of people while the run popup
 * counted three hundred), with a cell per platform where one is stored. `problem` is the
 * filter «show only who needs attention»: any platform in error, warning or
 * failed. `not_implemented` and `no_link` are not problems.
 */
export async function listProfileChecks({
  departmentId,
  q,
}: { departmentId?: string; q?: string } = {}): Promise<ProfileCheckRow[]> {
  const staff = await db.staff.findMany({
    where: {
      ...ON_ROSTER,
      isNpp: true,
      ...(departmentId ? onDepartment(departmentId) : {}),
      // By name, word by word — «Вайнтрауб Марк» finds them in any order
      ...(q ? (nameSearch(q, ['lastName', 'firstName', 'patronymic']) ?? {}) : {}),
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
      orcidId: true,
      wosUrl: true,
      scopusUrl: true,
      googleScholarUrl: true,
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
      links: {
        orcid: s.orcidId,
        wos: s.wosUrl,
        scopus: s.scopusUrl,
        googleScholar: s.googleScholarUrl,
      },
      problem: Object.values(cells).some((c) => PROBLEM.has(c.status)),
      problemPlatforms: PLATFORMS.filter((p) => cells[p] && PROBLEM.has(cells[p]!.status)),
    };
  });
}
