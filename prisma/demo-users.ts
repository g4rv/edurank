import bcrypt from 'bcryptjs';
import { passwordProblem } from '../lib/auth/password-rules';
import { parseTypeSpecs } from '../validations/activity-type-spec';
import { computeScore } from '../lib/rating/scoring';
import { recomputeRatingEntries } from '../lib/rating/recompute';
import {
  FEMALE_NAMES,
  FEMALE_PATRONYMICS,
  MALE_NAMES,
  MALE_PATRONYMICS,
  SURNAMES,
  feminine,
  makeRandom,
  pick,
  sampleEvidence,
} from './population';
import type { Prisma, PrismaClient } from '../lib/generated/prisma/client';

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

/**
 * Obviously not a real mailbox, and short enough to type at a demo.
 *
 * Was `demo.edurank.local` until 2026-08-18. Shortening it means these accounts
 * now share a domain with `sample-people.ts`, which the destructive dev modes
 * create — so the domain alone is no longer safe as a delete filter. See
 * `isDemoEmail`.
 */
export const DEMO_DOMAIN = 'edurank.local';

/**
 * One password per role, so «who am I signing in as» is obvious at a projector.
 *
 * Every one satisfies the app's own rules — eight characters, a capital, a
 * digit and a special — which `assertUsable()` below checks rather than trusts,
 * because a demo account the app itself would refuse to create is a confusing
 * thing to discover live.
 *
 * These are DELIBERATELY weak and printed in the source. Set `DEMO_PASSWORD` to
 * override all of them anywhere the URL is public — edurank.uhsp.edu.ua is.
 */
export const DEMO_PASSWORDS = {
  ADMIN: 'Admin123!',
  EDITOR: 'Editor123!',
  HEAD: 'Head123!',
  DEAN: 'Dean123!',
  USER: 'User123!',
} as const;

export type DemoRole = keyof typeof DEMO_PASSWORDS;

/** The override, or null when each role keeps its own */
export const DEMO_PASSWORD_OVERRIDE = process.env.DEMO_PASSWORD ?? null;

export function demoPassword(role: DemoRole): string {
  return DEMO_PASSWORD_OVERRIDE ?? DEMO_PASSWORDS[role];
}

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
  /** Which of the five demo passwords this account uses */
  pass: DemoRole;
}

/**
 * Hashes each distinct password once, not once per person.
 *
 * bcrypt at cost 10 is ~100ms; the population is 140 people across five
 * passwords, so caching turns fourteen seconds of hashing into half a second.
 */
function hasher() {
  const cache = new Map<DemoRole, Promise<string>>();
  return (role: DemoRole) => {
    const hit = cache.get(role);
    if (hit) return hit;
    const made = bcrypt.hash(demoPassword(role), 10);
    cache.set(role, made);
    return made;
  };
}

/**
 * Refuses to seed a password the app itself would reject.
 *
 * These are typed straight into `DEMO_PASSWORDS`, where nothing validates them.
 * Somebody shortening one to «Admin1!» would create accounts that work — bcrypt
 * hashes anything — and then find the reset form refuses the same value, which
 * is a confusing thing to hit in front of an audience.
 */
function assertUsable(): void {
  for (const role of Object.keys(DEMO_PASSWORDS) as DemoRole[]) {
    const problem = passwordProblem(demoPassword(role));
    if (problem) throw new Error(`Пароль для ${role} не проходить правила: ${problem}`);
  }
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
    pass: 'ADMIN',
  },
  {
    local: 'nnv',
    last: 'Кравчук',
    first: 'Ігор',
    patronymic: 'Петрович',
    role: 'EDITOR',
    isNpp: false,
    nnv: true,
    pass: 'EDITOR',
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
    pass: 'HEAD',
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
    pass: 'DEAN',
  },
  {
    local: 'npp1',
    last: 'Бондаренко',
    first: 'Марія',
    patronymic: 'Іванівна',
    role: 'USER',
    isNpp: true,
    profile: 'mid',
    pass: 'USER',
  },
  {
    local: 'npp2',
    last: 'Савчук',
    first: 'Дмитро',
    patronymic: 'Олегович',
    role: 'USER',
    isNpp: true,
    profile: 'low',
    pass: 'USER',
  },
];

export const DEMO_EMAILS = PEOPLE.map((p) => `${p.local}@${DEMO_DOMAIN}`);

/** Each named account with the password it takes — what the seed prints */
export const DEMO_LOGINS: readonly { email: string; role: DemoRole }[] = PEOPLE.map((p) => ({
  email: `${p.local}@${DEMO_DOMAIN}`,
  role: p.pass,
}));

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
  assertUsable();
  const hash = hasher();

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
      passwordHash: await hash(person.pass),
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

/** How many НПП each кафедра gets, on top of its завідувач */
const PER_DEPARTMENT = 3;

export interface PopulationResult {
  departments: number;
  created: number;
  skipped: number;
  headsSet: number;
  headsTaken: number;
}

/**
 * Fills EVERY кафедра — a завідувач and three НПП each, with ratings that differ.
 *
 * A demo of one кафедра shows the кафедра screen. It does not show «Рейтинг
 * НПП», the charts, or the ставка list, all of which are about comparing
 * кафедри — and an empty comparison is the one thing a rating system must not
 * look like when somebody is deciding whether to adopt it (owner, 2026-08-17).
 *
 * **Idempotent by email.** A person who already exists is left completely
 * alone, activities included — re-running must not double anybody's score. So
 * the addresses are derived from position (`npp-07-2@…`) rather than from the
 * random name, and the random seed is fixed: the same command builds the same
 * university every time.
 *
 * Everyone can sign in, unlike the `--rater` population, which deliberately has
 * no passwords. The point here is showing the app AS these people.
 */
export async function seedDemoPopulation(prisma: PrismaClient): Promise<PopulationResult> {
  assertUsable();
  const hash = hasher();

  const template = await prisma.ratingTemplate.findFirst({
    where: { status: 'OPEN' },
    select: { id: true, year: true },
  });
  if (!template) throw new Error('Немає активного рейтингового року. Спершу: pnpm db:seed');

  const types = await prisma.activityType.findMany({
    where: { templateId: template.id, isActive: true, inputSource: { not: 'PROFILE_DERIVED' } },
    select: {
      id: true,
      code: true,
      coefficient: true,
      inputSource: true,
      evidenceFields: true,
      scoring: true,
    },
  });
  if (types.length === 0)
    throw new Error('У активного року немає показників. Спершу: pnpm db:seed');

  const departments = await prisma.department.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true, headId: true },
  });
  if (departments.length === 0) throw new Error('Немає кафедр. Спершу: pnpm db:seed:structure');

  const random = makeRandom(20260817);
  const result: PopulationResult = {
    departments: departments.length,
    created: 0,
    skipped: 0,
    headsSet: 0,
    headsTaken: 0,
  };
  const scored: string[] = [];

  for (const [index, department] of departments.entries()) {
    const slot = String(index + 1).padStart(2, '0');

    for (let n = 0; n <= PER_DEPARTMENT; n += 1) {
      const isHead = n === 0;
      const email = isHead ? `head-${slot}@${DEMO_DOMAIN}` : `npp-${slot}-${n}@${DEMO_DOMAIN}`;

      // Names still come from the generator so the list reads like a real
      // кафедра, but they are decoration — the email is the identity.
      const isFemale = random() < 0.55;
      const base = pick(random, SURNAMES);
      const lastName = isFemale ? feminine(base) : base;
      const firstName = pick(random, isFemale ? FEMALE_NAMES : MALE_NAMES);
      const patronymic = pick(random, isFemale ? FEMALE_PATRONYMICS : MALE_PATRONYMICS);
      // Drawn even when the person is skipped, so the sequence does not shift
      // and everybody else keeps the name they had last run.
      const share = random() ** 2;

      const existing = await prisma.staff.findUnique({ where: { email }, select: { id: true } });
      if (existing) {
        result.skipped += 1;
        if (isHead && !department.headId) {
          await prisma.department.update({
            where: { id: department.id },
            data: { headId: existing.id },
          });
          result.headsSet += 1;
        }
        continue;
      }

      const staff = await prisma.staff.create({
        data: {
          email,
          lastName,
          firstName,
          patronymic,
          isNpp: true,
          role: 'USER',
          // A кафедра's завідувач signs in with the head password, like the
          // named `head@` does — one password per ROLE, not per account.
          passwordHash: await hash(isHead ? 'HEAD' : 'USER'),
          departmentId: department.id,
          adminPosition: isHead ? 'DEPARTMENT_OR_UNIT_HEAD' : null,
          pedagogicalExperience: 1 + Math.floor(random() * 35),
          employmentRate: 1,
          ...(isHead
            ? {
                academicRank: 'PROFESSOR' as const,
                scientificDegree: 'DOCTOR' as const,
                degreeMatchesDepartment: true,
              }
            : {}),
        },
        select: { id: true },
      });
      result.created += 1;
      scored.push(staff.id);

      await giveActivities(prisma, staff.id, share, types, random, template.year);

      // Never over a real завідувач — on a live database that is somebody
      // losing their кафедра to a fixture.
      if (isHead) {
        if (department.headId) result.headsTaken += 1;
        else {
          await prisma.department.update({
            where: { id: department.id },
            data: { headId: staff.id },
          });
          result.headsSet += 1;
        }
      }
    }
  }

  // The six NAMED accounts get a rating too.
  //
  // They are the ones somebody actually signs in as during a demo — `head@` and
  // `npp1@` are memorable in a way `npp-07-2@` is not — and «Мій рейтинг» with
  // nothing in it is the worst first screen this app has. Only ever filled once:
  // the check is «has no activity yet», so a second run leaves the score alone.
  const named = await prisma.staff.findMany({
    where: { email: { in: DEMO_EMAILS }, isNpp: true },
    select: { id: true, _count: { select: { activities: true } } },
  });
  for (const person of named) {
    if (person._count.activities > 0) continue;
    // Not squared: these four should look like people who use the system, not
    // like the median of a long tail.
    await giveActivities(prisma, person.id, 0.4 + random() * 0.5, types, random, template.year);
    scored.push(person.id);
  }

  if (scored.length > 0) {
    await recomputeRatingEntries(prisma, scored, template.year);
  }
  return result;
}

/**
 * Gives one person a slice of the year's indicators, scored the real way.
 *
 * `share` is the fraction of the catalogue they hold. Evidence goes through the
 * type's own generated Zod schema, so a catalogue change that breaks the sample
 * data fails loudly here instead of writing rows that score NaN.
 */
async function giveActivities(
  prisma: PrismaClient,
  staffId: string,
  share: number,
  types: {
    id: string;
    code: string;
    coefficient: number;
    inputSource: string;
    evidenceFields: unknown;
    scoring: unknown;
  }[],
  random: () => number,
  year: number
): Promise<void> {
  const count = Math.round(share * types.length);
  if (count <= 0) return;

  const shuffled = [...types].sort(() => random() - 0.5).slice(0, count);
  const rows: Prisma.ActivityCreateManyInput[] = [];

  for (const type of shuffled) {
    const specs = parseTypeSpecs(type);
    const evidence = specs.schema.parse(sampleEvidence(specs.fields, random));
    const { computedValue, score } = computeScore(
      {
        code: type.code,
        coefficient: type.coefficient,
        scoring: specs.scoring,
        evidenceFields: specs.fields,
      },
      evidence
    );
    rows.push({
      staffId,
      activityTypeId: type.id,
      year,
      evidence: evidence as Prisma.InputJsonValue,
      computedValue,
      score,
      status: 'APPROVED',
      submittedByRole: type.inputSource === 'DIVISION_MANAGED' ? 'DIVISION' : 'NPP',
      approvedAt: new Date(),
    });
  }
  await prisma.activity.createMany({ data: rows });
}

async function nameOf(prisma: PrismaClient, staffId: string): Promise<string> {
  const person = await prisma.staff.findUnique({
    where: { id: staffId },
    select: { lastName: true, firstName: true },
  });
  return person ? `${person.lastName} ${person.firstName}` : staffId;
}

/**
 * Is this one of OUR accounts?
 *
 * The domain used to be the whole filter. It cannot be any more: shortening it
 * to `edurank.local` (2026-08-18) put these on the same domain as
 * `sample-people.ts`, whose `editor@`, `npp3@`, `npp4@` and `npp5@` this must
 * never touch. So the local part decides — the six named ones, plus the
 * positional addresses the population generates.
 */
function isDemoEmail(email: string): boolean {
  if (!email.endsWith(`@${DEMO_DOMAIN}`)) return false;
  if (DEMO_EMAILS.includes(email)) return true;
  return /^(head-\d{2}|npp-\d{2}-\d)@/.test(email);
}

/**
 * Removes every demo account, and nothing else.
 *
 * A hard delete rather than an archive — the app never deletes a PERSON, and
 * that rule is about real careers and closed rating years. These are fixtures;
 * leaving them archived would keep them in the кафедра's history for no reason.
 */
export async function removeDemoUsers(prisma: PrismaClient): Promise<number> {
  const onDomain = await prisma.staff.findMany({
    where: { email: { endsWith: `@${DEMO_DOMAIN}` } },
    select: { id: true, email: true },
  });
  const demo = onDomain.filter((s) => isDemoEmail(s.email));
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
