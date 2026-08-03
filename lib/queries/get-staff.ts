import { db } from '@/lib/db';

export async function getStaff(id: string, includeConfidential = false) {
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
      ...(includeConfidential ? { employmentRate: true } : {}),
      pedagogicalExperience: true,
      academicRank: true,
      scientificDegree: true,
      degreeMatchesDepartment: true,
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
          faculty: { select: { name: true } },
        },
      },
      division: { select: { id: true, name: true } },
      partTimeDepartments: {
        select: {
          department: {
            select: {
              id: true,
              name: true,
              faculty: { select: { name: true } },
            },
          },
        },
      },
      headOfDepartment: { select: { id: true, name: true } },
      deanOfFaculty: { select: { id: true, name: true } },
    },
  });
}

export type StaffDetail = NonNullable<Awaited<ReturnType<typeof getStaff>>>;
