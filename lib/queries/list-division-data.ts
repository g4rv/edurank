import { db } from '@/lib/db';
import { ON_ROSTER } from './roster';

/** Divisions owning at least one active division-managed type in the active template */
export async function listEntryDivisions() {
  return db.division.findMany({
    where: {
      verifiedTypes: { some: { isActive: true, template: { isActive: true } } },
    },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
}

/** One division's managed activity types in the active template, in sheet order */
export async function listDivisionActivityTypes(divisionId: string) {
  return db.activityType.findMany({
    where: { verifyingDivisionId: divisionId, isActive: true, template: { isActive: true } },
    select: {
      id: true,
      code: true,
      label: true,
      itemNumber: true,
      coefficientNote: true,
      evidenceFields: true,
      entityFirstEntry: true,
      section: { select: { number: true } },
    },
    orderBy: [{ section: { number: 'asc' } }, { order: 'asc' }],
  });
}

export type DivisionActivityType = Awaited<ReturnType<typeof listDivisionActivityTypes>>[number];

/** The division's live entries for one year (for prefilling the entry grid) */
export async function listDivisionEntries(divisionId: string, year: number) {
  return db.activity.findMany({
    where: {
      year,
      status: 'APPROVED',
      submittedByRole: 'DIVISION',
      activityType: { verifyingDivisionId: divisionId },
    },
    select: { id: true, staffId: true, activityTypeId: true, score: true, evidence: true },
  });
}

/** All НПП as grid rows, alphabetical */
export async function listNppForRating() {
  return db.staff.findMany({
    where: { ...ON_ROSTER, isNpp: true },
    select: {
      id: true,
      lastName: true,
      firstName: true,
      patronymic: true,
      department: { select: { name: true } },
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });
}
