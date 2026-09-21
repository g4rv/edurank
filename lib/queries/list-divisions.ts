import { db } from '@/lib/db';
import { parseSortDir, parseSortField, type SortDir } from '@/lib/queries/sort';
import type { Prisma } from '@/lib/generated/prisma/client';

/** Every відділ, id and name only — the picker on the staff form. */
export async function listDivisions() {
  return db.division.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
}

export type DivisionOption = Awaited<ReturnType<typeof listDivisions>>[number];

/**
 * The columns «Відділи» can be ordered by — see `list-faculties.ts` for why
 * this is a whitelist and not the raw query param.
 */
export const DIVISION_SORTS = ['name', 'staff'] as const;
export type DivisionSort = (typeof DIVISION_SORTS)[number];

export function parseDivisionSort(value: unknown): DivisionSort {
  return parseSortField(value, DIVISION_SORTS, 'name');
}

function divisionOrderBy(
  sort: DivisionSort,
  dir: SortDir
): Prisma.DivisionOrderByWithRelationInput[] {
  // The name is the tiebreaker: most відділи hold a handful of people and
  // several hold the same number, so a count alone leaves their order free to
  // change between requests.
  return sort === 'staff' ? [{ staff: { _count: dir } }, { name: 'asc' }] : [{ name: dir }];
}

/**
 * Every відділ with how many people sit in it, and how many permissions it
 * carries.
 *
 * The two permission counts are what this screen is actually for: a відділ IS
 * the permission model, so «which відділи can do anything» is the question
 * somebody opens this list with, and it was not on it — the answer took a click
 * into each record in turn.
 */
export async function listDivisionRows(options?: {
  sort?: DivisionSort | string | string[];
  dir?: string | string[];
}) {
  return db.division.findMany({
    select: {
      id: true,
      name: true,
      _count: {
        select: { staff: true, fieldPermissions: true, entityPermissions: true },
      },
    },
    orderBy: divisionOrderBy(parseDivisionSort(options?.sort), parseSortDir(options?.dir)),
  });
}

export type DivisionListItem = Awaited<ReturnType<typeof listDivisionRows>>[number];
