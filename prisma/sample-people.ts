import bcrypt from 'bcryptjs';
import { PrismaClient } from '../lib/generated/prisma/client';

// The handful of accounts every non-production mode needs: one of each role,
// plus a завідувач and a декан so the pages that only they can reach have an
// owner.
//
// Real names are deliberately NOT used and every address is @edurank.local, so
// nobody can mistake this database for production and nobody can accidentally
// email a colleague from a test system. The STRUCTURE is real; the people are
// not.

export const SAMPLE_PASSWORD = 'Preprod2026!';

/** Invented staff. `level` decides how much profile they carry. */
const STAFF = [
  { last: 'Адміненко', first: 'Олег', patronymic: 'Ігорович', role: 'ADMIN' as const },
  { last: 'Редакторук', first: 'Наталія', patronymic: 'Петрівна', role: 'EDITOR' as const },
] as const;

/** The НПП, in кафедра 0 unless said otherwise */
const NPP = [
  { last: 'Ліщенко', first: 'Марта', patronymic: 'Василівна', dept: 0, level: 'high' },
  { last: 'Гайовий', first: 'Тарас', patronymic: 'Степанович', dept: 0, level: 'mid' },
  { last: 'Соломко', first: 'Ірина', patronymic: 'Богданівна', dept: 0, level: 'mid' },
  { last: 'Верещак', first: 'Павло', patronymic: 'Андрійович', dept: 0, level: 'low' },
  { last: 'Дзюбенко', first: 'Оксана', patronymic: 'Юріївна', dept: 0, level: 'none' },
  // The head of that same кафедра, so /my-department and /stakes have an owner
  {
    last: 'Завгородня',
    first: 'Леся',
    patronymic: 'Миколаївна',
    dept: 0,
    level: 'high',
    head: true,
  },
  // The dean of another faculty — read access across every кафедра of it
  {
    last: 'Деканенко',
    first: 'Роман',
    patronymic: 'Сергійович',
    dept: 1,
    level: 'high',
    dean: true,
  },
] as const;

/**
 * The local part is derived from the position rather than transliterated: it is
 * easier to type at a login screen, and transliteration is not worth a
 * dependency for nine accounts.
 */
const LOCAL_PART: Record<string, string> = {
  Адміненко: 'admin',
  Редакторук: 'editor',
  Ліщенко: 'npp1',
  Гайовий: 'npp2',
  Соломко: 'npp3',
  Верещак: 'npp4',
  Дзюбенко: 'npp5',
  Завгородня: 'head',
  Деканенко: 'dean',
};

export function sampleEmail(lastName: string): string {
  return `${LOCAL_PART[lastName] ?? lastName.toLowerCase()}@edurank.local`;
}

export const SAMPLE_EMAILS = [...STAFF, ...NPP].map((p) => sampleEmail(p.last));

export async function seedSamplePeople(
  prisma: PrismaClient,
  options: { departmentIds: string[]; nnvDivisionId: string }
): Promise<number> {
  const passwordHash = await bcrypt.hash(SAMPLE_PASSWORD, 10);

  for (const person of STAFF) {
    await prisma.staff.create({
      data: {
        email: sampleEmail(person.last),
        lastName: person.last,
        firstName: person.first,
        patronymic: person.patronymic,
        isNpp: false,
        role: person.role,
        passwordHash,
        divisionId: person.role === 'EDITOR' ? options.nnvDivisionId : null,
      },
    });
  }

  for (const person of NPP) {
    const departmentId = options.departmentIds[person.dept];
    if (!departmentId) throw new Error(`No кафедра at index ${person.dept}`);

    const staff = await prisma.staff.create({
      data: {
        email: sampleEmail(person.last),
        lastName: person.last,
        firstName: person.first,
        patronymic: person.patronymic,
        isNpp: true,
        role: 'USER',
        passwordHash,
        departmentId,
        ...profileFor(person.level),
      },
    });

    if ('head' in person && person.head) {
      await prisma.department.update({ where: { id: departmentId }, data: { headId: staff.id } });
    }
    if ('dean' in person && person.dean) {
      const department = await prisma.department.findUniqueOrThrow({
        where: { id: departmentId },
        select: { facultyId: true },
      });
      await prisma.faculty.update({
        where: { id: department.facultyId },
        data: { deanId: staff.id },
      });
    }
  }

  return STAFF.length + NPP.length;
}

/**
 * Profile fields that feed the PROFILE_DERIVED indicators, so the НПП do not
 * all score identically. Nothing here is a rating row — `syncProfileDerived`
 * turns these into scores when the app next touches the person.
 */
function profileFor(level: string) {
  switch (level) {
    case 'high':
      return {
        academicRank: 'PROFESSOR' as const,
        scientificDegree: 'DOCTOR' as const,
        degreeMatchesDepartment: true,
        pedagogicalExperience: 24,
        employmentRate: 1,
      };
    case 'mid':
      return {
        academicRank: 'DOCENT' as const,
        scientificDegree: 'CANDIDATE' as const,
        degreeMatchesDepartment: true,
        pedagogicalExperience: 12,
        employmentRate: 1,
      };
    case 'low':
      return {
        academicRank: 'SENIOR_LECTURER' as const,
        scientificDegree: 'CANDIDATE' as const,
        degreeMatchesDepartment: false,
        pedagogicalExperience: 5,
        employmentRate: 0.75,
      };
    default:
      return { pedagogicalExperience: 1, employmentRate: 0.5 };
  }
}
