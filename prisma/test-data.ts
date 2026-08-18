import bcrypt from 'bcryptjs';
import { passwordProblem } from '../lib/auth/password-rules';
import { parseTypeSpecs } from '../validations/activity-type-spec';
import { computeScore } from '../lib/rating/scoring';
import { recomputeRatingEntries } from '../lib/rating/recompute';
import { ACCEPTED_STUDENTS } from '../lib/students/accepted';
import { normaliseStudentName } from '../lib/stake/claims';
import { MIN_STAKE } from '../lib/stake/units';
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
} from './fake-names';
import type { AdminPosition, Prisma, PrismaClient } from '../lib/generated/prisma/client';

// A small university that exercises EVERY screen — `pnpm db:seed:test`.
//
// Two факультети and five кафедри rather than the real eight and thirty-one.
// The point is not to look like UHSP; it is to be small enough to read in one
// screen and complete enough that nothing is untestable. Thirty-one кафедри of
// invented people make the ставка list a scrolling wall in which a bug hides.
//
// **The кафедри are real names anyway**, because three features match on them:
// `specialityOrigin` decides «своя / чужа» кафедра from
// `lib/specialities/departments.ts`, and a кафедра it does not recognise turns
// the завідувач's chips grey with no answer at all. An invented кафедра would
// silently disable a feature rather than exercise it.
//
// What this guarantees, so a tester never has to go looking:
//
//   • every кафедра has a завідувач        → /my-department, the ставка grid
//   • every факультет has a декан          → «лише перегляд», scopeOf
//   • one ННВ editor                       → /moderation, /division-data
//   • ratings from zero to full            → /rating, the charts, «за формулою»
//   • somebody on EVERY adminPosition      → «Статуси» and надбавки
//   • pending, confirmed and rejected      → /my-department/students
//     student claims
//   • Кст and a bonus fund on every кафедра → the whole two-phase распределение

/** Real кафедри, so the випускова-кафедра lookup resolves */
const FACULTIES = [
  {
    name: 'Факультет гуманітарної освіти і соціальних технологій',
    departments: [
      'Кафедра політології та журналістики',
      'Кафедра публічного управління та адміністрування',
      'Кафедра цифрових технологій навчання',
    ],
  },
  {
    name: 'Факультет фінансово-економічної і професійної освіти',
    departments: ['Кафедра економіки', 'Кафедра фінансів'],
  },
] as const;

export const TEST_DOMAIN = 'edurank.local';

/**
 * One password per role, so «who am I signed in as» is readable at a projector.
 * Checked against the app's own rules before anything is written — see
 * `assertUsable`.
 */
export const TEST_PASSWORDS = {
  ADMIN: 'Admin123!',
  EDITOR: 'Editor123!',
  HEAD: 'Head123!',
  DEAN: 'Dean123!',
  USER: 'User123!',
} as const;

export type TestRole = keyof typeof TEST_PASSWORDS;

/** Override for anywhere the URL is public — these are printed in the source */
export const TEST_PASSWORD_OVERRIDE = process.env.SEED_PASSWORD ?? null;

export function testPassword(role: TestRole): string {
  return TEST_PASSWORD_OVERRIDE ?? TEST_PASSWORDS[role];
}

/**
 * Refuses to seed a password the app itself would reject.
 *
 * `TEST_PASSWORDS` is a plain const that nothing validates. Shortening one to
 * «Admin1!» would create accounts that sign in — bcrypt hashes anything — and
 * then be refused by the reset form, which is a confusing thing to hit while
 * demonstrating.
 */
function assertUsable(): void {
  for (const role of Object.keys(TEST_PASSWORDS) as TestRole[]) {
    const problem = passwordProblem(testPassword(role));
    if (problem) throw new Error(`Пароль для ${role} не проходить правила: ${problem}`);
  }
}

/** bcrypt is ~100ms; five passwords across ~30 people is worth caching */
function hasher() {
  const cache = new Map<TestRole, Promise<string>>();
  return (role: TestRole) => {
    const hit = cache.get(role);
    if (hit) return hit;
    const made = bcrypt.hash(testPassword(role), 10);
    cache.set(role, made);
    return made;
  };
}

/**
 * Every administrative position, so «Статуси» and the надбавка have somebody to
 * apply to. Handed out in order across the people who are not already a
 * завідувач or a декан — those two carry their own position.
 */
const SPARE_POSITIONS: readonly AdminPosition[] = [
  'VICE_RECTOR',
  'VICE_DEAN_OR_SECRETARY',
  'DEPUTY_DEPARTMENT_HEAD',
  'DEPUTY_ADMISSION_SECRETARY',
  'LAB_OR_CENTER_HEAD',
];

export interface TestResult {
  faculties: number;
  departments: number;
  staff: number;
  heads: number;
  deans: number;
  claims: number;
  zeroRating: number;
  logins: { email: string; role: TestRole; note: string }[];
}

/**
 * Builds the whole thing. Assumes the catalogue is already seeded — the rating
 * template, the divisions and додаток 5's specialities all come from there.
 *
 * Deletes nothing itself: `--test` wipes through the dispatcher, so this can
 * stay readable as «create a university».
 */
export async function seedTestUniverse(prisma: PrismaClient): Promise<TestResult> {
  assertUsable();
  const hash = hasher();
  const random = makeRandom(20260818);

  const template = await prisma.ratingTemplate.findFirst({
    where: { status: 'OPEN' },
    select: { id: true, year: true },
  });
  if (!template) throw new Error('Немає активного рейтингового року. Спершу: pnpm db:seed');
  const year = template.year;

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

  const nnv = await prisma.division.findFirst({
    where: { registryKey: 'NNV' },
    select: { id: true },
  });
  if (!nnv) throw new Error('Немає відділу ННВ. Спершу: pnpm db:seed');

  const result: TestResult = {
    faculties: 0,
    departments: 0,
    staff: 0,
    heads: 0,
    deans: 0,
    claims: 0,
    zeroRating: 0,
    logins: [],
  };

  // ── the administrator ──────────────────────────────────────────────────────
  const admin = await prisma.staff.upsert({
    where: { email: `admin@${TEST_DOMAIN}` },
    update: {},
    create: {
      email: `admin@${TEST_DOMAIN}`,
      lastName: 'Демченко',
      firstName: 'Ольга',
      patronymic: 'Василівна',
      role: 'ADMIN',
      isNpp: false,
      passwordHash: await hash('ADMIN'),
    },
    select: { id: true },
  });
  result.staff += 1;
  result.logins.push({
    email: `admin@${TEST_DOMAIN}`,
    role: 'ADMIN',
    note: 'адміністратор — усе',
  });

  // ── the ННВ editor ─────────────────────────────────────────────────────────
  // A division member is a role the app cannot demonstrate without one:
  // /moderation and /division-data are both gated on division membership, not
  // on a Role.
  await prisma.staff.upsert({
    where: { email: `nnv@${TEST_DOMAIN}` },
    update: {},
    create: {
      email: `nnv@${TEST_DOMAIN}`,
      lastName: 'Кравчук',
      firstName: 'Ігор',
      patronymic: 'Петрович',
      role: 'EDITOR',
      isNpp: false,
      divisionId: nnv.id,
      passwordHash: await hash('EDITOR'),
    },
    select: { id: true },
  });
  result.staff += 1;
  result.logins.push({
    email: `nnv@${TEST_DOMAIN}`,
    role: 'EDITOR',
    note: 'ННВ — модерація, дані відділу',
  });

  const scored: string[] = [];
  let spare = 0;
  let deptIndex = 0;

  for (const faculty of FACULTIES) {
    const facultyRow = await prisma.faculty.upsert({
      where: { name: faculty.name },
      update: {},
      create: { name: faculty.name },
      select: { id: true },
    });
    result.faculties += 1;

    /** The first кафедра's head becomes this факультет's декан */
    let deanId: string | null = null;

    for (const departmentName of faculty.departments) {
      deptIndex += 1;
      const slot = String(deptIndex).padStart(2, '0');

      const department = await prisma.department.upsert({
        where: { name_facultyId: { name: departmentName, facultyId: facultyRow.id } },
        update: {},
        create: { name: departmentName, facultyId: facultyRow.id },
        select: { id: true },
      });
      result.departments += 1;

      // 3–8, drawn per кафедра: a distribution where every кафедра is the same
      // size hides anything that depends on кафедра size — Кнпп, the формула's
      // average, the ten-row scroll box.
      const size = 3 + Math.floor(random() * 6);
      const people: { id: string; rating: number }[] = [];

      for (let n = 1; n <= size; n += 1) {
        const isHead = n === 1;
        const email = isHead
          ? `head-${slot}@${TEST_DOMAIN}`
          : `npp-${slot}-${n - 1}@${TEST_DOMAIN}`;

        const isFemale = random() < 0.55;
        const base = pick(random, SURNAMES);
        const lastName = isFemale ? feminine(base) : base;
        const firstName = pick(random, isFemale ? FEMALE_NAMES : MALE_NAMES);
        const patronymic = pick(random, isFemale ? FEMALE_PATRONYMICS : MALE_PATRONYMICS);

        // One person per кафедра scores NOTHING — the case that broke the grid
        // twice (a red field nobody could clear, then a floor nobody could go
        // under). Everybody else is skewed by a squared draw, so most hold a
        // few indicators and one or two hold nearly all.
        const inactive = n === size && size > 3;
        const share = inactive ? 0 : random() ** 2;

        // The декан carries DEAN, a завідувач carries the head position, and
        // the rest take one of the remaining five in turn until they run out.
        // Annotated, because `deanId` is assigned from `person` further down and
        // TypeScript otherwise chases the two through each other.
        const wantsDean: boolean = isHead && deanId === null;
        const position: AdminPosition | null = wantsDean
          ? 'DEAN'
          : isHead
            ? 'DEPARTMENT_OR_UNIT_HEAD'
            : spare < SPARE_POSITIONS.length
              ? SPARE_POSITIONS[spare++]!
              : null;

        const person: { id: string } = await prisma.staff.upsert({
          where: { email },
          update: {},
          create: {
            email,
            lastName,
            firstName,
            patronymic,
            isNpp: true,
            role: 'USER',
            departmentId: department.id,
            adminPosition: position,
            passwordHash: await hash(wantsDean ? 'DEAN' : isHead ? 'HEAD' : 'USER'),
            employmentRate: 1,
            pedagogicalExperience: 1 + Math.floor(random() * 35),
            ...profileFor(inactive ? 'none' : isHead ? 'high' : share > 0.4 ? 'mid' : 'low'),
          },
          select: { id: true },
        });
        result.staff += 1;
        if (inactive) result.zeroRating += 1;

        const rating = await giveActivities(prisma, person.id, share, types, random, year);
        people.push({ id: person.id, rating });
        scored.push(person.id);

        if (isHead) {
          await prisma.department.update({
            where: { id: department.id },
            data: { headId: person.id },
          });
          result.heads += 1;
          result.logins.push({
            email,
            role: wantsDean ? 'DEAN' : 'HEAD',
            note: wantsDean ? `декан + завідувач ${departmentName}` : `завідувач ${departmentName}`,
          });
          if (wantsDean) {
            await prisma.faculty.update({
              where: { id: facultyRow.id },
              data: { deanId: person.id },
            });
            deanId = person.id;
            result.deans += 1;
          }
        } else if (result.logins.length < 8) {
          result.logins.push({ email, role: 'USER', note: `НПП ${departmentName}` });
        }
      }

      // A fund on every кафедра, so the ставка grid is never the empty state.
      // Generous enough that the head has room to hand something out: the
      // formula spends Кст exactly, and the bonus fund is what phase 2 uses.
      const kst = Math.max(people.length * 20, MIN_STAKE * people.length);
      await prisma.departmentStake.upsert({
        where: { departmentId_year: { departmentId: department.id, year } },
        update: {},
        create: {
          departmentId: department.id,
          year,
          kstHundredths: kst,
          bonusPoolHundredths: Math.round(kst / 4 / 5) * 5,
        },
      });

      result.claims += await giveClaims(prisma, people, departmentName, year, random, admin.id);
    }
  }

  await recomputeRatingEntries(prisma, scored, year);
  return result;
}

/** Profile fields so the PROFILE_DERIVED indicators do not all score alike */
function profileFor(level: 'high' | 'mid' | 'low' | 'none') {
  switch (level) {
    case 'high':
      return {
        academicRank: 'PROFESSOR' as const,
        scientificDegree: 'DOCTOR' as const,
        degreeMatchesDepartment: true,
      };
    case 'mid':
      return {
        academicRank: 'DOCENT' as const,
        scientificDegree: 'CANDIDATE' as const,
        degreeMatchesDepartment: true,
      };
    case 'low':
      return {
        academicRank: 'SENIOR_LECTURER' as const,
        scientificDegree: 'CANDIDATE' as const,
        degreeMatchesDepartment: false,
      };
    default:
      return {};
  }
}

/**
 * Gives one person a slice of the year's indicators, scored the real way, and
 * returns what they now hold.
 *
 * Evidence goes through the type's own generated Zod schema, so a catalogue
 * change that breaks the sample data fails loudly here rather than writing rows
 * that score NaN.
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
): Promise<number> {
  const count = Math.round(share * types.length);
  if (count <= 0) return 0;

  const shuffled = [...types].sort(() => random() - 0.5).slice(0, count);
  const rows: Prisma.ActivityCreateManyInput[] = [];
  let total = 0;

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
    total += score;
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
  return total;
}

/**
 * Student claims in all three states, on real names from the 2026 register.
 *
 * PENDING is the one that matters — it is what a завідувач sees waiting on
 * /my-department/students, and a кафедра with none makes that screen look
 * broken. CONFIRMED and REJECTED are here so the НПП's own page shows every
 * badge without anybody having to click through the flow first.
 */
async function giveClaims(
  prisma: PrismaClient,
  people: { id: string }[],
  departmentName: string,
  year: number,
  random: () => number,
  confirmerId: string
): Promise<number> {
  const owners = await prisma.speciality.findMany({ select: { id: true, name: true } });
  if (owners.length === 0) return 0;

  // Students on a speciality this кафедра graduates, so «своя кафедра» is
  // exercised rather than always reading «чужа».
  const { specialitiesOf } = await import('../lib/specialities/departments');
  const own = specialitiesOf(departmentName);
  const pool = ACCEPTED_STUDENTS.filter((s) => own.includes(s.speciality));
  if (pool.length === 0) return 0;

  const statuses = ['PENDING', 'PENDING', 'CONFIRMED', 'REJECTED'] as const;
  let made = 0;

  for (let i = 0; i < Math.min(statuses.length, pool.length); i += 1) {
    const author = people[Math.floor(random() * people.length)];
    if (!author) break;
    const student = pool[Math.floor(random() * pool.length)]!;
    const speciality = owners.find((s) => s.name === student.speciality);
    if (!speciality) continue;

    const status = statuses[i]!;
    try {
      await prisma.studentClaim.create({
        data: {
          staffId: author.id,
          year,
          studentName: student.name,
          studentNameNormalised: normaliseStudentName(student.name),
          specialityId: speciality.id,
          degree: student.degree,
          form: student.form,
          funding: student.funding,
          status,
          ...(status === 'CONFIRMED'
            ? { confirmedById: confirmerId, confirmedAt: new Date() }
            : {}),
          ...(status === 'REJECTED'
            ? { rejectReason: 'Здобувач вступив на іншу спеціальність' }
            : {}),
        },
      });
      made += 1;
    } catch {
      // The same author claiming the same student twice is refused by a unique
      // index. Random picks collide; skipping is the whole handling.
    }
  }
  return made;
}
