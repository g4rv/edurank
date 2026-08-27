import { db } from '@/lib/db';
import { ON_ROSTER } from '@/lib/queries/roster';
import { SECTION_TITLES } from '@/lib/rating/activity-types';
import { round2 } from '@/lib/round';

// Everything the overview page draws, from three queries and arithmetic in JS.
// At ~300 НПП the whole set fits in memory comfortably, and doing the maths here
// keeps the shapes the charts want in one readable place.

export interface ScoreBand {
  /** Inclusive lower bound of the band */
  from: number;
  /** Exclusive upper bound — except the last band, which is closed */
  to: number;
  count: number;
}

export interface DepartmentScore {
  id: string;
  name: string;
  faculty: string;
  nppCount: number;
  average: number;
}

export interface FacultyNode {
  id: string;
  name: string;
  nppCount: number;
  departments: { id: string; name: string; nppCount: number }[];
}

export interface DashboardData {
  nppCount: number;
  otherStaffCount: number;
  /** НПП with at least one point this year */
  scoredCount: number;
  averageScore: number;
  medianScore: number;
  topScore: number;
  sectionTotals: { section: number; title: string; total: number }[];
  distribution: ScoreBand[];
  departments: DepartmentScore[];
  faculties: FacultyNode[];
}

/** Round a raw band width up to something a person reads: 50, 100, 250, 500… */
function niceStep(raw: number): number {
  const steps = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
  return steps.find((s) => s >= raw) ?? 10000;
}

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Bands the scores so the shape of the year is visible. Empty bands are kept —
 * a gap between the crowd and the top few is the point of the chart, and
 * dropping empty bands would quietly close it up.
 */
export function bandScores(totals: number[]): ScoreBand[] {
  const top = Math.max(...totals, 0);
  if (top === 0) return [];

  const step = niceStep(Math.ceil(top / 10));
  const bandCount = Math.max(1, Math.ceil(top / step));

  const bands: ScoreBand[] = Array.from({ length: bandCount }, (_, i) => ({
    from: i * step,
    to: (i + 1) * step,
    count: 0,
  }));

  for (const total of totals) {
    const index = Math.min(Math.floor(total / step), bandCount - 1);
    bands[index].count += 1;
  }

  return bands;
}

export async function getDashboard(year: number): Promise<DashboardData> {
  const [faculties, npp, otherStaffCount] = await Promise.all([
    db.faculty.findMany({
      select: {
        id: true,
        name: true,
        departments: { select: { id: true, name: true }, orderBy: { name: 'asc' } },
      },
      orderBy: { name: 'asc' },
    }),
    db.staff.findMany({
      where: { ...ON_ROSTER, isNpp: true },
      select: {
        departmentId: true,
        partTimeDepartments: { select: { departmentId: true } },
        ratingEntries: {
          where: { year },
          select: {
            section1Score: true,
            section2Score: true,
            section3Score: true,
            section4Score: true,
            section5Score: true,
            totalScore: true,
          },
        },
      },
    }),
    db.staff.count({ where: { ...ON_ROSTER, isNpp: false } }),
  ]);

  const totals = npp.map((s) => s.ratingEntries[0]?.totalScore ?? 0);
  const sorted = [...totals].sort((a, b) => a - b);
  const sum = totals.reduce((acc, t) => acc + t, 0);

  const sectionTotals = [1, 2, 3, 4, 5].map((section) => ({
    section,
    title: SECTION_TITLES[section],
    // Rounded once at the end — a few hundred stored 2-decimal scores added
    // together still drift, and this figure goes straight onto a chart label.
    total: round2(
      npp.reduce((acc, s) => {
        const entry = s.ratingEntries[0];
        if (!entry) return acc;
        const scores = [
          entry.section1Score,
          entry.section2Score,
          entry.section3Score,
          entry.section4Score,
          entry.section5Score,
        ];
        return acc + scores[section - 1];
      }, 0)
    ),
  }));

  // Один прохід по НПП: скільки їх на кафедрі і скільки балів разом
  //
  // A сумісник lands in TWO buckets (2026-08-24): both кафедри pay them, both
  // count them, and both average their score in. The university-wide figures
  // above are computed from `npp` directly, so nobody is double-counted there.
  const byDepartment = new Map<string, { count: number; sum: number }>();
  const addTo = (departmentId: string, total: number) => {
    const bucket = byDepartment.get(departmentId) ?? { count: 0, sum: 0 };
    bucket.count += 1;
    bucket.sum += total;
    byDepartment.set(departmentId, bucket);
  };

  for (const [i, member] of npp.entries()) {
    if (member.departmentId) addTo(member.departmentId, totals[i]);
    for (const { departmentId } of member.partTimeDepartments) {
      if (departmentId === member.departmentId) continue;
      addTo(departmentId, totals[i]);
    }
  }

  /**
   * HOW MANY PEOPLE — one кафедра each, whatever they hold (owner, 2026-08-27):
   * «НПП is a people count, it doesn't matter if they work for 1 or 5
   * departments, it's only one human being».
   *
   * Separate from `byDepartment` above, which deliberately puts a сумісник in
   * both кафедри — that map feeds the AVERAGE SCORE, and both кафедри should
   * average in somebody who teaches on them. Counting the same way made one
   * person two: the «НПП» card said 327 while the tree summed to 347.
   *
   * Home кафедра is the full-time post, or the part-time one for somebody who
   * holds no full-time post anywhere (legal since 2026-08-26). Every person
   * lands in exactly one bucket, so кафедра → факультет → university all add up.
   *
   * Note this is the DASHBOARD's question. The ставка grid still shows and pays
   * every сумісник, and `Кст ≥ 0,1 × N` still counts them — a pool has to cover
   * everybody it pays.
   */
  const headByDepartment = new Map<string, number>();
  for (const member of npp) {
    const home = member.departmentId ?? member.partTimeDepartments[0]?.departmentId;
    if (!home) continue;
    headByDepartment.set(home, (headByDepartment.get(home) ?? 0) + 1);
  }

  const departments: DepartmentScore[] = faculties
    .flatMap((faculty) =>
      faculty.departments.map((department) => {
        const bucket = byDepartment.get(department.id);
        return {
          id: department.id,
          name: department.name,
          faculty: faculty.name,
          nppCount: headByDepartment.get(department.id) ?? 0,
          // A division rarely lands on two decimals by itself
          average: bucket && bucket.count > 0 ? round2(bucket.sum / bucket.count) : 0,
        };
      })
    )
    .sort((a, b) => b.average - a.average || a.name.localeCompare(b.name, 'uk'));

  const facultyNodes: FacultyNode[] = faculties.map((faculty) => {
    const departmentNodes = faculty.departments.map((department) => ({
      id: department.id,
      name: department.name,
      nppCount: headByDepartment.get(department.id) ?? 0,
    }));
    return {
      id: faculty.id,
      name: faculty.name,
      // Plain sum, and correct now that every person sits in exactly one
      // кафедра — no Set needed to de-duplicate what cannot repeat.
      nppCount: departmentNodes.reduce((acc, d) => acc + d.nppCount, 0),
      departments: departmentNodes,
    };
  });

  return {
    nppCount: npp.length,
    otherStaffCount,
    scoredCount: totals.filter((t) => t > 0).length,
    averageScore: npp.length > 0 ? sum / npp.length : 0,
    medianScore: median(sorted),
    topScore: Math.max(...totals, 0),
    sectionTotals,
    distribution: bandScores(totals),
    departments,
    faculties: facultyNodes,
  };
}
