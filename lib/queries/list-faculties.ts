import { db } from '@/lib/db';
import { parseSortDir, parseSortField, type SortDir } from '@/lib/queries/sort';
import type { Prisma } from '@/lib/generated/prisma/client';

/**
 * The columns «Факультети» can be ordered by.
 *
 * A whitelist rather than a field name off the query string: `orderBy` reaches
 * Prisma, so an unchecked param is a caller choosing what the database sorts on.
 */
export const FACULTY_SORTS = ['name', 'dean', 'departments'] as const;
export type FacultySort = (typeof FACULTY_SORTS)[number];

/** Anything that is not a column we sort by falls back to the name. */
export function parseFacultySort(value: unknown): FacultySort {
  return parseSortField(value, FACULTY_SORTS, 'name');
}

/**
 * **Every sort but the name falls back to the name.** A факультет with no декан
 * and a факультет with no кафедри both sort on a value that says nothing about
 * them, and without a tiebreaker Postgres is free to return those rows in a
 * different order on every request — so the list would reshuffle under the
 * reader each time they navigated back to it.
 */
function facultyOrderBy(sort: FacultySort, dir: SortDir): Prisma.FacultyOrderByWithRelationInput[] {
  switch (sort) {
    case 'dean':
      return [{ dean: { lastName: dir } }, { name: 'asc' }];
    case 'departments':
      return [{ departments: { _count: dir } }, { name: 'asc' }];
    default:
      return [{ name: dir }];
  }
}

export async function listFaculties(options?: {
  sort?: FacultySort | string | string[];
  dir?: string | string[];
}) {
  return db.faculty.findMany({
    select: {
      id: true,
      name: true,
      dean: { select: { id: true, lastName: true, firstName: true, patronymic: true } },
      _count: { select: { departments: true } },
    },
    orderBy: facultyOrderBy(parseFacultySort(options?.sort), parseSortDir(options?.dir)),
  });
}

export type FacultyListItem = Awaited<ReturnType<typeof listFaculties>>[number];
