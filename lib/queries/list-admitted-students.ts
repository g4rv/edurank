import { db } from '@/lib/db';
import { normaliseStudentName } from '@/lib/stake/claims';
import type { Funding, StudentDegree, StudyForm } from '@/lib/stake/norms';
import type { RegisterCriteria, RegisterRow } from '@/lib/students/accepted';

// Reading the реєстр зарахованих. Everything that used to be an array scan in
// lib/students/accepted.ts — see docs/students-register.md for why it moved.
//
// The year is never guessed here. Callers pass it: the claim flow passes the
// active template's year, and /admin/students passes whatever the URL says out
// of the years that actually have rows.

export const ADMITTED_PAGE_SIZE = 30;

/** One register row as every screen wants it — speciality flattened to its name */
export interface AdmittedStudentRow {
  id: string;
  name: string;
  speciality: string;
  degree: StudentDegree;
  form: StudyForm;
  funding: Funding;
}

const ROW_SELECT = {
  id: true,
  name: true,
  degree: true,
  form: true,
  funding: true,
  speciality: { select: { name: true } },
} as const;

interface JoinedRow {
  id: string;
  name: string;
  degree: StudentDegree;
  form: StudyForm;
  funding: Funding;
  speciality: { name: string };
}

function flatten(row: JoinedRow): AdmittedStudentRow {
  const { speciality, ...rest } = row;
  return { ...rest, speciality: speciality.name };
}

/**
 * A whole year's register, for `registerOptions` to build the picker's cascade.
 *
 * All of it, deliberately. The cascade is derived from which combinations have
 * a student behind them, so it cannot be built from a page — and what reaches
 * the browser is a few KB of speciality names, not a thousand teenagers' ПІБ.
 */
export async function registerRows(year: number): Promise<RegisterRow[]> {
  const rows = await db.admittedStudent.findMany({
    where: { year },
    select: {
      name: true,
      degree: true,
      form: true,
      funding: true,
      speciality: { select: { name: true } },
    },
  });
  return rows.map((row) => ({
    name: row.name,
    speciality: row.speciality.name,
    degree: row.degree,
    form: row.form,
    funding: row.funding,
  }));
}

/**
 * The ПІБ admitted under one combination, in Ukrainian alphabetical order.
 *
 * Names only: this feeds the picker's last step, and whoever asked already
 * knows the three criteria that got them here.
 */
export async function studentsMatching(
  year: number,
  criteria: RegisterCriteria
): Promise<string[]> {
  const rows = await db.admittedStudent.findMany({
    where: {
      year,
      form: criteria.form,
      funding: criteria.funding,
      speciality: { name: criteria.speciality },
    },
    select: { name: true },
    orderBy: { name: 'asc' },
  });
  return rows.map((row) => row.name);
}

/**
 * The one register row a claim names, or null.
 *
 * ПІБ is the key WITH the criteria, never on its own: twenty people of the 2026
 * intake are on two programmes at once, so one ПІБ can name two register rows
 * and two different claims. The five together are unique — the model's
 * @@unique says so.
 *
 * The name is matched on `nameNormalised`, which is written by the SAME
 * normaliser StudentClaim uses. Anything else and «О’лена» typed with U+2019
 * and «О'лена» typed with an apostrophe are two different people.
 */
export async function findAcceptedStudent(
  year: number,
  name: string,
  criteria: RegisterCriteria
): Promise<AdmittedStudentRow | null> {
  const row = await db.admittedStudent.findFirst({
    where: {
      year,
      nameNormalised: normaliseStudentName(name),
      form: criteria.form,
      funding: criteria.funding,
      speciality: { name: criteria.speciality },
    },
    select: ROW_SELECT,
  });
  return row ? flatten(row) : null;
}

/** The вступні кампанії that have students, newest first */
export async function admittedYears(): Promise<number[]> {
  const rows = await db.admittedStudent.findMany({
    distinct: ['year'],
    select: { year: true },
    orderBy: { year: 'desc' },
  });
  return rows.map((row) => row.year);
}

/**
 * The sortable columns, by the name the URL carries.
 *
 * `speciality` sorts by НАЗВА, not by code (owner, 2026-09-03). The code is
 * derived from `SPECIALITY_CODES`, a constant keyed by name — it is in no
 * column, so sorting by it would mean loading every matching row and paging in
 * JavaScript. The cell still shows the code first, so an alphabetical list has
 * its codes out of order; «show me one programme» is what the спеціальність
 * filter is for.
 */
export const ADMITTED_SORTS = ['name', 'funding', 'form', 'degree', 'speciality'] as const;
export type AdmittedSort = (typeof ADMITTED_SORTS)[number];

/**
 * Every ordering ends on `id`.
 *
 * Twenty ПІБ repeat in the 2026 intake, and the enum columns have two values
 * across a thousand rows — so without a unique tie-break a page boundary
 * returns some rows twice and drops others entirely. `name` is the middle key
 * on the enum sorts so that «all Денна» is itself alphabetical rather than
 * arbitrary.
 *
 * Note the enums sort in DECLARATION order, which is what Postgres does with an
 * enum column and what the screen wants anyway: Бакалавр before Магістр, Денна
 * before Заочна, Бюджет before Контракт.
 */
function orderFor(sort: AdmittedSort, dir: 'asc' | 'desc') {
  const tail = [{ name: 'asc' as const }, { id: 'asc' as const }];
  switch (sort) {
    case 'speciality':
      return [{ speciality: { name: dir } }, ...tail];
    case 'funding':
      return [{ funding: dir }, ...tail];
    case 'form':
      return [{ form: dir }, ...tail];
    case 'degree':
      return [{ degree: dir }, ...tail];
    case 'name':
      return [{ name: dir }, { id: 'asc' as const }];
  }
}

export interface AdmittedFilters {
  year: number;
  degree?: StudentDegree;
  form?: StudyForm;
  funding?: Funding;
  specialityId?: string;
  /** Free text over the ПІБ; normalised before it is matched */
  search?: string;
  page: number;
  sort?: AdmittedSort;
  dir?: 'asc' | 'desc';
}

export interface AdmittedPage {
  rows: AdmittedStudentRow[];
  total: number;
  /** At least 1, so an empty year renders a table rather than a pager saying «0» */
  totalPages: number;
}

/** One page of /admin/students, filtered and searched */
export async function listAdmittedStudents(filters: AdmittedFilters): Promise<AdmittedPage> {
  const search = normaliseStudentName(filters.search ?? '');

  const where = {
    year: filters.year,
    ...(filters.degree ? { degree: filters.degree } : {}),
    ...(filters.form ? { form: filters.form } : {}),
    ...(filters.funding ? { funding: filters.funding } : {}),
    ...(filters.specialityId ? { specialityId: filters.specialityId } : {}),
    ...(search ? { nameNormalised: { contains: search } } : {}),
  };

  const page = Math.max(1, filters.page);

  const [total, rows] = await Promise.all([
    db.admittedStudent.count({ where }),
    db.admittedStudent.findMany({
      where,
      select: ROW_SELECT,
      orderBy: orderFor(filters.sort ?? 'name', filters.dir ?? 'asc'),
      skip: (page - 1) * ADMITTED_PAGE_SIZE,
      take: ADMITTED_PAGE_SIZE,
    }),
  ]);

  return {
    rows: rows.map(flatten),
    total,
    totalPages: Math.max(1, Math.ceil(total / ADMITTED_PAGE_SIZE)),
  };
}
