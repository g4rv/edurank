import { PrismaClient } from '../lib/generated/prisma/client';
import { DEPARTMENTS, FACULTIES } from './preprod-org';

// The university's real tree, and the reset that clears the people standing in
// it. Shared by every seed mode that has people in it, because the кафедра
// pickers, the ставка grid and the випускова-кафедра colours only behave the way
// they will on the day if the кафедри are the real ones.
//
// Кафедра names must match `lib/specialities/departments.ts` byte for byte or
// `specialityOrigin` answers `unknown` and a завідувач's chips go gray — a test
// in `departments.test.ts` pins all 31 against the довідник.

export interface Structure {
  facultyIds: Map<string, string>;
  /** In the order of `DEPARTMENTS`, so a seed can pick «the first кафедра» */
  departmentIds: string[];
}

/**
 * Upserts the 8 факультети and 31 кафедри.
 *
 * Upsert rather than create: this runs after `wipePeople` in a destructive
 * mode, but also on its own, and a second run must find the same rows rather
 * than fail on the unique name.
 */
export async function seedStructure(prisma: PrismaClient): Promise<Structure> {
  const facultyIds = new Map<string, string>();
  for (const faculty of FACULTIES) {
    const row = await prisma.faculty.upsert({
      where: { name: faculty.name },
      update: {},
      create: { name: faculty.name },
    });
    facultyIds.set(faculty.short, row.id);
  }

  const departmentIds: string[] = [];
  for (const department of DEPARTMENTS) {
    const facultyId = facultyIds.get(department.faculty);
    if (!facultyId) {
      throw new Error(`No faculty «${department.faculty}» for кафедра «${department.name}»`);
    }
    const row = await prisma.department.upsert({
      where: { name_facultyId: { name: department.name, facultyId } },
      update: {},
      create: { name: department.name, facultyId },
    });
    departmentIds.push(row.id);
  }

  return { facultyIds, departmentIds };
}

/**
 * Clears people and structure, leaving the catalogue to be re-upserted.
 *
 * Order matters: everything that points at a person goes first. Cascades cover
 * most of it, but relying on them here would make this script's behaviour
 * depend on schema details that are not its business.
 */
export async function wipePeople(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction([
    prisma.stakeSandbox.deleteMany(),
    prisma.stakeAllocation.deleteMany(),
    prisma.stakeDistribution.deleteMany(),
    prisma.departmentStake.deleteMany(),
    prisma.staffStakeLimits.deleteMany(),
    prisma.studentClaim.deleteMany(),
    prisma.activity.deleteMany(),
    prisma.ratingEntry.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.loginThrottle.deleteMany(),
    prisma.activationToken.deleteMany(),
    prisma.staffDepartment.deleteMany(),
  ]);

  // Heads and deans point at staff, so those links must go before the people do.
  await prisma.department.updateMany({ data: { headId: null } });
  await prisma.faculty.updateMany({ data: { deanId: null } });
  await prisma.staff.deleteMany();
  await prisma.department.deleteMany();
  await prisma.faculty.deleteMany();
}

/**
 * Also drops the rating templates, so `seedCatalogue` rebuilds exactly the 67
 * indicators the вчена рада approved.
 *
 * Necessary because that function UPSERTS: anything an admin added by hand
 * survives it. On a dev database that meant two junk demo indicators («asd»,
 * «іва») and a 2027 clone came through a «clean» reseed and the count read 69.
 * Safe only after `wipePeople`, which has already deleted every activity and
 * rating entry that could point at them.
 */
export async function wipeTemplates(prisma: PrismaClient): Promise<void> {
  await prisma.ratingTemplate.deleteMany();
}
