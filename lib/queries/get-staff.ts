import { cache } from 'react';
import { db } from '@/lib/db';

/**
 * One person's whole record.
 *
 * **`cache()`d, and the record page is why** (2026-09-09). The identity band and
 * the Профіль tab are two components of the same request — the band is in
 * `layout.tsx` behind its own `Suspense`, the cards are in `page.tsx` — and both
 * need the same row, so without this the heaviest query on that page ran twice.
 *
 * React `cache` keys on the arguments, and the two callers pass the same pair:
 * both compute `includeConfidential` as «ADMIN, or this person themselves», so
 * they share the entry rather than each getting their own.
 */
export const getStaff = cache(async function getStaff(id: string, includeConfidential = false) {
  return db.staff.findUnique({
    where: { id },
    select: {
      id: true,
      lastName: true,
      firstName: true,
      patronymic: true,
      email: true,
      phone: true,
      isNpp: true,
      // Whose record this is, in the permission sense: an editor may edit and
      // delete USER rows and their own, never an admin's. The pages need it to
      // stop offering «Редагувати» on a record the action will refuse.
      role: true,
      // Off the roster: drives the archived badge, the restore button and the
      // read-only treatment of the record
      archivedAt: true,
      archiveReason: true,
      ...(includeConfidential ? { employmentRate: true } : {}),
      pedagogicalExperience: true,
      academicRank: true,
      scientificDegree: true,
      degreeMatchesDepartment: true,
      degreeDefenceDate: true,
      adminPosition: true,
      basicEducationMatch: true,
      basicEducationSpecialty: true,
      wosUrl: true,
      wosCitationCount: true,
      scopusUrl: true,
      scopusCitationCount: true,
      googleScholarUrl: true,
      googleScholarCitationCount: true,
      orcidId: true,
      department: {
        select: {
          id: true,
          name: true,
          faculty: { select: { id: true, name: true } },
        },
      },
      division: { select: { id: true, name: true } },
      partTimeDepartments: {
        select: {
          department: {
            select: {
              id: true,
              name: true,
              faculty: { select: { id: true, name: true } },
            },
          },
        },
      },
      headOfDepartment: { select: { id: true, name: true } },
      deanOfFaculty: { select: { id: true, name: true } },
    },
  });
});

export type StaffDetail = NonNullable<Awaited<ReturnType<typeof getStaff>>>;
