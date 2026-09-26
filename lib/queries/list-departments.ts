import { db } from '@/lib/db';
import { parseSortDir, parseSortField, type SortDir } from '@/lib/queries/sort';
import type { Prisma } from '@/lib/generated/prisma/client';

/** Every кафедра, id and name only — the picker on a form or a filter bar. */
export async function listDepartments() {
  return db.department.findMany({
    select: {
      id: true,
      name: true,
      facultyId: true,
      faculty: { select: { name: true } },
    },
    orderBy: [{ faculty: { name: 'asc' } }, { name: 'asc' }],
  });
}

export type DepartmentOption = Awaited<ReturnType<typeof listDepartments>>[number];

/**
 * The columns «Кафедри» can be ordered by — see `list-faculties.ts` for why
 * this is a whitelist and not the raw query param.
 *
 * **`faculty` is not one of them any more.** The list is grouped under a
 * факультет heading, so ordering BY факультет is what the page already does;
 * these three order the кафедри INSIDE each group. An old
 * `/departments?sort=faculty` link falls back to the name, which is the view it
 * used to produce.
 */
export const DEPARTMENT_SORTS = ['name', 'head', 'staff'] as const;
export type DepartmentSort = (typeof DEPARTMENT_SORTS)[number];

export function parseDepartmentSort(value: unknown): DepartmentSort {
  return parseSortField(value, DEPARTMENT_SORTS, 'name');
}

/** The name is the tiebreaker on every other column, so the list is stable. */
function departmentOrderBy(
  sort: DepartmentSort,
  dir: SortDir
): Prisma.DepartmentOrderByWithRelationInput[] {
  switch (sort) {
    case 'head':
      return [{ head: { lastName: dir } }, { name: 'asc' }];
    case 'staff':
      return [{ primaryStaff: { _count: dir } }, { name: 'asc' }];
    default:
      return [{ name: dir }];
  }
}

/**
 * Every кафедра, under the факультет it belongs to.
 *
 * **Fetched as факультети with their кафедри nested**, not as a flat list the
 * page then buckets: the grouping IS the query's order, so letting Postgres do
 * it keeps the two from disagreeing — and the sort inside a group is one
 * `orderBy` on the nested relation rather than a second pass in JavaScript.
 *
 * **`primaryStaff` is the count, and it is the кафедра's OWN people.** A
 * сумісник is attached through `StaffDepartment` and paid by both кафедри, but
 * they are not this one's headcount — see the `Кнпп` rule in `CLAUDE.md`. The
 * column is headed «НПП» for that reason rather than «Співробітники».
 *
 * **The groups are always А→Я**, whatever `dir` says. `dir` belongs to the
 * column heading the reader clicked, and every one of those is a кафедра
 * column — flipping the факультети too would move the whole page under
 * somebody who asked for one column to reverse.
 */
export async function listDepartmentsByFaculty(options?: {
  sort?: DepartmentSort | string | string[];
  dir?: string | string[];
}) {
  const faculties = await db.faculty.findMany({
    select: {
      id: true,
      name: true,
      departments: {
        select: {
          id: true,
          name: true,
          head: { select: { id: true, lastName: true, firstName: true, patronymic: true } },
          _count: { select: { primaryStaff: true } },
        },
        orderBy: departmentOrderBy(parseDepartmentSort(options?.sort), parseSortDir(options?.dir)),
      },
    },
    orderBy: { name: 'asc' },
  });

  return toGroups(faculties);
}

// Read off the query rather than written out a second time. `ReturnType` on
// `toGroups` itself resolves the GENERIC against its constraint, which throws
// away every field but `_count` — the shape has to come from the one call site
// that pins it.
export type DepartmentGroup = Awaited<ReturnType<typeof listDepartmentsByFaculty>>[number];
export type DepartmentRow = DepartmentGroup['departments'][number];

/**
 * Drop the факультети that hold no кафедри, and total what is left.
 *
 * **A факультет with no кафедри is not on this page.** The screen lists
 * кафедри; a heading with nothing under it is a group that is not a group, and
 * the fact it would be reporting — «this факультет is empty» — is already the
 * «0» in the Кафедри column on `/faculties`, which is the screen that lists
 * факультети.
 *
 * Exported so it can be tested without a database.
 */
export function toGroups<D extends { _count: { primaryStaff: number } }>(
  faculties: { id: string; name: string; departments: D[] }[]
) {
  return faculties
    .filter((faculty) => faculty.departments.length > 0)
    .map((faculty) => ({
      id: faculty.id,
      name: faculty.name,
      departments: faculty.departments,
      /** How many кафедри sit under this heading. */
      count: faculty.departments.length,
      /** Their НПП added up, so the heading lines up with the column below it. */
      staffTotal: faculty.departments.reduce((sum, d) => sum + d._count.primaryStaff, 0),
    }));
}
