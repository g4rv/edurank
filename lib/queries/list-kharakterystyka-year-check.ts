import { db } from '@/lib/db';
import { ON_ROSTER } from '@/lib/queries/roster';
import { windowFor } from '@/lib/kharakterystyka/positions';
import {
  CHECKED_POSITIONS,
  DUPLICATE_OF_RATING,
  HIDE_REASONS,
  yearProblem,
  type HideReason,
  type YearProblem,
} from '@/lib/kharakterystyka/year-check';
import {
  findRatingDuplicates,
  type DuplicateOf,
} from '@/lib/queries/list-kharakterystyka-duplicates';

export interface YearCheckRow {
  id: string;
  staffId: string;
  /** «Прізвище Ім'я По батькові» */
  staffName: string;
  facultyName: string | null;
  departmentName: string | null;
  position: number;
  source: 'MANUAL' | 'IMPORT';
  /** The year the line was FILED under — inside the window, which is why it counts */
  filedYear: number;
  text: string;
  /** Why it is a suspect — null on a line listed only as a copy of a rating entry */
  problem: YearProblem | null;
  /** The rating entry this line copies — filled on the «Дублікати» tab and on a line hidden as a copy */
  duplicateOf: DuplicateOf | null;
  /** Filled only for a hidden line */
  reason: HideReason | null;
  hiddenAt: Date | null;
  hiddenBy: string | null;
}

const SELECT = {
  id: true,
  staffId: true,
  position: true,
  source: true,
  year: true,
  text: true,
  removedAt: true,
  removedBy: true,
  removedReason: true,
  staff: {
    select: {
      lastName: true,
      firstName: true,
      patronymic: true,
      department: { select: { name: true, faculty: { select: { name: true } } } },
    },
  },
} as const;

/**
 * What the admin page lists (owner, 2026-11-12), in three groups:
 *
 * - **suspects** — lines still in the document, inside the window by their
 *   filing year, in a position that is a bibliographic description, whose
 *   description names a publication from before the window;
 * - **duplicates** — TYPED lines that copy an entry of the same person's rating.
 *   The typed line is the copy: the rating entry carries the structured evidence
 *   and stays. An imported line is not «hand made» and is not offered;
 * - **hidden** — lines this page took out, for either reason. They are the only
 *   ones it can bring back; a line a person removed has no reason and is not
 *   listed.
 *
 * Sorted the way the page groups them — факультет, кафедра, person — so the
 * page does no sorting of its own.
 */
export async function listYearCheck(
  lastYear: number
): Promise<{ suspects: YearCheckRow[]; duplicates: YearCheckRow[]; hidden: YearCheckRow[] }> {
  const window = windowFor(lastYear);

  const [live, hiddenRows] = await Promise.all([
    db.kharakterystykaEntry.findMany({
      where: {
        position: { in: [...CHECKED_POSITIONS] },
        year: { gte: window.from, lte: window.to },
        removedAt: null,
        staff: { isNpp: true, ...ON_ROSTER },
      },
      select: SELECT,
    }),
    db.kharakterystykaEntry.findMany({
      where: { removedReason: { in: [...HIDE_REASONS] }, removedAt: { not: null } },
      select: SELECT,
    }),
  ]);

  const adminIds = [...new Set(hiddenRows.map((r) => r.removedBy).filter((v): v is string => !!v))];
  const admins = adminIds.length
    ? await db.staff.findMany({
        where: { id: { in: adminIds } },
        select: { id: true, lastName: true, firstName: true },
      })
    : [];
  const adminName = new Map(admins.map((a) => [a.id, `${a.lastName} ${a.firstName}`]));

  // A typed line that copies a rating entry — for the live ones and for those
  // already hidden as a copy, whose twin is the proof on the «Приховані» tab
  const hiddenCopies = hiddenRows.filter((r) => r.removedReason === DUPLICATE_OF_RATING);
  const twins = await findRatingDuplicates(
    [...live.filter((r) => r.source === 'MANUAL'), ...hiddenCopies],
    lastYear
  );

  type Raw = (typeof live)[number];
  const toRow = (r: Raw, problem: YearProblem | null, hidden: boolean): YearCheckRow => ({
    id: r.id,
    staffId: r.staffId,
    staffName: `${r.staff.lastName} ${r.staff.firstName} ${r.staff.patronymic}`.trim(),
    facultyName: r.staff.department?.faculty.name ?? null,
    departmentName: r.staff.department?.name ?? null,
    position: r.position,
    source: r.source,
    filedYear: r.year,
    text: r.text,
    problem,
    duplicateOf: twins.get(r.id) ?? null,
    reason: hidden ? (r.removedReason as HideReason | null) : null,
    hiddenAt: hidden ? r.removedAt : null,
    hiddenBy: hidden && r.removedBy ? (adminName.get(r.removedBy) ?? null) : null,
  });

  const suspects: YearCheckRow[] = [];
  const duplicates: YearCheckRow[] = [];
  for (const r of live) {
    const problem = yearProblem(r.text, window);
    if (problem) suspects.push(toRow(r, problem, false));
    if (r.source === 'MANUAL' && twins.has(r.id)) duplicates.push(toRow(r, problem, false));
  }

  // A hidden line is listed whatever the check says of it today: it was hidden
  // for a reason, and bringing it back must stay possible if the rule moves.
  const hidden = hiddenRows.map((r) => toRow(r, yearProblem(r.text, window), true));

  const order = (a: YearCheckRow, b: YearCheckRow) =>
    (a.facultyName ?? '￿').localeCompare(b.facultyName ?? '￿', 'uk') ||
    (a.departmentName ?? '￿').localeCompare(b.departmentName ?? '￿', 'uk') ||
    a.staffName.localeCompare(b.staffName, 'uk') ||
    a.position - b.position ||
    a.filedYear - b.filedYear;
  suspects.sort(order);
  duplicates.sort(order);
  hidden.sort(order);
  return { suspects, duplicates, hidden };
}
