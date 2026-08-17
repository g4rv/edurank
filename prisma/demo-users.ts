import bcrypt from 'bcryptjs';
import type { PrismaClient } from '../lib/generated/prisma/client';

// A handful of working accounts for showing the app to somebody — safe to run
// against a database that already has real data in it.
//
// **Why this is not `--base`.** That mode calls `wipePeople()` first: it exists
// to rebuild a dev database from nothing, and on production it would delete the
// administrator, the structure and the audit log. This one only upserts, only
// touches its own accounts, and can be run again on Tuesday without undoing
// Monday.
//
// **Invented people on a real tree.** Факультети, кафедри and відділи are the
// university's own; the people are not. Attaching a shared demo password to a
// REAL colleague's name would put their name on every action taken during the
// demo, in an audit log that is supposed to be evidence of who did what. The
// names below are ordinary Ukrainian ones so the screens look like the real
// thing, and every address ends in `@demo.edurank.local` so nobody can mistake
// an account for a person — or miss one when clearing up.

/** Findable, deletable, and obviously not a real mailbox */
export const DEMO_DOMAIN = 'demo.edurank.local';

/**
 * Set `DEMO_PASSWORD` to something else before running this anywhere the URL
 * is public. The default is here so a demo is one command, not so it is a
 * secret — anybody reading this file knows it.
 */
export const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? 'EduRankDemo2026!';

/** The кафедра the demo НПП sit on — a real one, so its спеціальності resolve */
const DEMO_DEPARTMENT = 'Кафедра політології та журналістики';
/** …and the факультет whose декан one of them is */
const DEMO_FACULTY = 'Факультет гуманітарної освіти і соціальних технологій';

interface DemoPerson {
  local: string;
  last: string;
  first: string;
  patronymic: string;
  role: 'ADMIN' | 'EDITOR' | 'USER';
  isNpp: boolean;
  /** Показує кафедру — стає завідувачем DEMO_DEPARTMENT */
  head?: boolean;
  /** Показує факультет — стає деканом DEMO_FACULTY */
  dean?: boolean;
  /** Editor of ННВ, which is the division that moderates */
  nnv?: boolean;
  profile?: 'high' | 'mid' | 'low';
  adminPosition?: 'DEAN' | 'DEPARTMENT_OR_UNIT_HEAD' | 'VICE_RECTOR';
}

/**
 * One account per screen somebody will want to see.
 *
 * A демо without a завідувач cannot show the ставка grid, and one without a
 * декан cannot show «лише перегляд» — those two roles are derived from
 * `Department.headId` / `Faculty.deanId`, not from a Role, so they need real
 * people sitting in the columns.
 */
const PEOPLE: readonly DemoPerson[] = [
  {
    local: 'admin',
    last: 'Демченко',
    first: 'Ольга',
    patronymic: 'Василівна',
    role: 'ADMIN',
    isNpp: false,
  },
  {
    local: 'nnv',
    last: 'Кравчук',
    first: 'Ігор',
    patronymic: 'Петрович',
    role: 'EDITOR',
    isNpp: false,
    nnv: true,
  },
  {
    local: 'head',
    last: 'Мельник',
    first: 'Наталія',
    patronymic: 'Степанівна',
    role: 'USER',
    isNpp: true,
    head: true,
    profile: 'high',
    adminPosition: 'DEPARTMENT_OR_UNIT_HEAD',
  },
  {
    local: 'dean',
    last: 'Ткаченко',
    first: 'Андрій',
    patronymic: 'Миколайович',
    role: 'USER',
    isNpp: true,
    dean: true,
    profile: 'high',
    adminPosition: 'DEAN',
  },
  {
    local: 'npp1',
    last: 'Бондаренко',
    first: 'Марія',
    patronymic: 'Іванівна',
    role: 'USER',
    isNpp: true,
    profile: 'mid',
  },
  {
    local: 'npp2',
    last: 'Савчук',
    first: 'Дмитро',
    patronymic: 'Олегович',
    role: 'USER',
    isNpp: true,
    profile: 'low',
  },
];

export const DEMO_EMAILS = PEOPLE.map((p) => `${p.local}@${DEMO_DOMAIN}`);

/** Profile fields so the PROFILE_DERIVED indicators do not all score the same */
function profileFor(level: DemoPerson['profile']) {
  switch (level) {
    case 'high':
      return {
        academicRank: 'PROFESSOR' as const,
        scientificDegree: 'DOCTOR' as const,
        degreeMatchesDepartment: true,
        pedagogicalExperience: 22,
        employmentRate: 1,
      };
    case 'mid':
      return {
        academicRank: 'DOCENT' as const,
        scientificDegree: 'CANDIDATE' as const,
        degreeMatchesDepartment: true,
        pedagogicalExperience: 11,
        employmentRate: 1,
      };
    case 'low':
      return {
        academicRank: 'SENIOR_LECTURER' as const,
        scientificDegree: 'CANDIDATE' as const,
        degreeMatchesDepartment: false,
        pedagogicalExperience: 4,
        employmentRate: 0.75,
      };
    default:
      return {};
  }
}

export interface DemoResult {
  created: number;
  updated: number;
  headSet: boolean;
  deanSet: boolean;
  /** Somebody real already leads it — left alone, and said out loud */
  headTaken: string | null;
  deanTaken: string | null;
}

/**
 * Creates or refreshes the demo accounts. Deletes nothing.
 *
 * Requires the catalogue and the structure to exist already — it looks the
 * кафедра and the відділ up by name rather than creating them, because a demo
 * that invents a кафедра would put a row in the tree that nobody can explain
 * later.
 */
export async function seedDemoUsers(prisma: PrismaClient): Promise<DemoResult> {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const department = await prisma.department.findFirst({
    where: { name: DEMO_DEPARTMENT },
    select: { id: true, headId: true, faculty: { select: { id: true, name: true, deanId: true } } },
  });
  if (!department) {
    throw new Error(`Немає кафедри «${DEMO_DEPARTMENT}». Спершу: pnpm db:seed:structure`);
  }
  if (department.faculty.name !== DEMO_FACULTY) {
    throw new Error(`Кафедра «${DEMO_DEPARTMENT}» лежить не на тому факультеті — перевірте дані`);
  }

  const nnv = await prisma.division.findFirst({
    where: { registryKey: 'NNV' },
    select: { id: true },
  });
  if (!nnv) throw new Error('Немає відділу ННВ. Спершу: pnpm db:seed');

  let created = 0;
  let updated = 0;
  const ids = new Map<string, string>();

  for (const person of PEOPLE) {
    const email = `${person.local}@${DEMO_DOMAIN}`;
    const existing = await prisma.staff.findUnique({ where: { email }, select: { id: true } });

    const data = {
      lastName: person.last,
      firstName: person.first,
      patronymic: person.patronymic,
      role: person.role,
      isNpp: person.isNpp,
      passwordHash,
      // Never carried over from a previous run: an archived demo account that
      // silently stayed archived would look like a broken login.
      archivedAt: null,
      departmentId: person.isNpp ? department.id : null,
      divisionId: person.nnv ? nnv.id : null,
      adminPosition: person.adminPosition ?? null,
      ...profileFor(person.profile),
    };

    const row = await prisma.staff.upsert({
      where: { email },
      update: data,
      create: { email, ...data },
      select: { id: true },
    });

    ids.set(person.local, row.id);
    if (existing) updated++;
    else created++;
  }

  // Headship and deanship are columns on the кафедра and the факультет, not a
  // Role — so they have to be written there. Never over somebody who is already
  // in the chair: on a production database that would be a real завідувач
  // quietly losing their кафедра to a demo account.
  const headId = ids.get('head')!;
  const deanId = ids.get('dean')!;

  const headTaken =
    department.headId && department.headId !== headId
      ? await nameOf(prisma, department.headId)
      : null;
  const deanTaken =
    department.faculty.deanId && department.faculty.deanId !== deanId
      ? await nameOf(prisma, department.faculty.deanId)
      : null;

  if (!headTaken) {
    await prisma.department.update({ where: { id: department.id }, data: { headId } });
  }
  if (!deanTaken) {
    await prisma.faculty.update({ where: { id: department.faculty.id }, data: { deanId } });
  }

  return {
    created,
    updated,
    headSet: !headTaken,
    deanSet: !deanTaken,
    headTaken,
    deanTaken,
  };
}

async function nameOf(prisma: PrismaClient, staffId: string): Promise<string> {
  const person = await prisma.staff.findUnique({
    where: { id: staffId },
    select: { lastName: true, firstName: true },
  });
  return person ? `${person.lastName} ${person.firstName}` : staffId;
}

/**
 * Removes every demo account, and nothing else.
 *
 * The domain is the whole filter, which is why the addresses are all on one.
 * A hard delete rather than an archive — the app never deletes a PERSON, and
 * that rule is about real careers and closed rating years. These are fixtures;
 * leaving them archived would keep them in the кафедра's history for no reason.
 */
export async function removeDemoUsers(prisma: PrismaClient): Promise<number> {
  const demo = await prisma.staff.findMany({
    where: { email: { endsWith: `@${DEMO_DOMAIN}` } },
    select: { id: true },
  });
  if (demo.length === 0) return 0;
  const ids = demo.map((d) => d.id);

  // The chair has to be vacated first: `headId` and `deanId` are set null on
  // delete, but saying so here keeps the order obvious rather than relying on
  // the schema's referential action.
  await prisma.department.updateMany({ where: { headId: { in: ids } }, data: { headId: null } });
  await prisma.faculty.updateMany({ where: { deanId: { in: ids } }, data: { deanId: null } });
  await prisma.staff.deleteMany({ where: { id: { in: ids } } });
  return demo.length;
}
