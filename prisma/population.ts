import { PrismaClient } from '../lib/generated/prisma/client';
import { parseTypeSpecs } from '../validations/activity-type-spec';
import { computeScore } from '../lib/rating/scoring';
import { recomputeRatingEntries } from '../lib/rating/recompute';
import type { EvidenceField } from '../lib/rating/evidence-fields';
import type { Prisma } from '../lib/generated/prisma/client';

// The `--rater` population — a university-shaped data set so the charts on
// «Огляд», the rating pages and the ставка grid have something to say.
//
//   pnpm db:seed --rater
//
// Invented people on the REAL кафедри. Every one of them gets an @demo.local
// address, which is what makes them identifiable as fake at a glance and
// removable in one query if they ever land somewhere they should not.
//
// They have no password: these are records to look at, not accounts to log in
// with. The nine accounts you actually sign in as come from sample-people.ts.

const DEMO_DOMAIN = '@demo.local';

/**
 * Deterministic PRNG (mulberry32). The same command gives the same university
 * every time, so a demo you showed last week looks the same today.
 */
function makeRandom(seed: number) {
  let a = seed;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SURNAMES = [
  'Мельник',
  'Шевченко',
  'Бондаренко',
  'Ткаченко',
  'Ковальчук',
  'Кравченко',
  'Олійник',
  'Шевчук',
  'Поліщук',
  'Бойко',
  'Коваленко',
  'Лисенко',
  'Марченко',
  'Савченко',
  'Руденко',
  'Мороз',
  'Кузьменко',
  'Гриценко',
  'Литвиненко',
  'Дяченко',
  'Пилипенко',
  'Соколов',
  'Романюк',
  'Захарчук',
  'Гончаренко',
  'Панасенко',
  'Данилюк',
  'Юрченко',
  'Василенко',
  'Тимошенко',
  'Клименко',
  'Онищенко',
  'Приходько',
  'Сергієнко',
  'Харченко',
  'Яценко',
  'Іваненко',
  'Костенко',
  'Науменко',
  'Павленко',
];

const MALE_NAMES = [
  'Олександр',
  'Андрій',
  'Володимир',
  'Сергій',
  'Ігор',
  'Дмитро',
  'Юрій',
  'Микола',
  'Тарас',
  'Богдан',
  'Роман',
  'Віктор',
  'Павло',
  'Максим',
  'Артем',
];

const FEMALE_NAMES = [
  'Олена',
  'Наталія',
  'Тетяна',
  'Ірина',
  'Оксана',
  'Марія',
  'Людмила',
  'Світлана',
  'Катерина',
  'Анна',
  'Галина',
  'Вікторія',
  'Юлія',
  'Софія',
  'Дарина',
];

const MALE_PATRONYMICS = [
  'Олександрович',
  'Андрійович',
  'Володимирович',
  'Сергійович',
  'Ігорович',
  'Дмитрович',
  'Юрійович',
  'Миколайович',
  'Тарасович',
  'Богданович',
  'Романович',
  'Вікторович',
  'Павлович',
];

const FEMALE_PATRONYMICS = [
  'Олександрівна',
  'Андріївна',
  'Володимирівна',
  'Сергіївна',
  'Ігорівна',
  'Дмитрівна',
  'Юріївна',
  'Миколаївна',
  'Тарасівна',
  'Богданівна',
  'Романівна',
  'Вікторівна',
  'Павлівна',
];

/** Female surnames in -енко/-ук/-як do not change; -ов/-ев take -а */
function feminine(surname: string): string {
  return /(ов|ев|ів|ин)$/.test(surname) ? `${surname}а` : surname;
}

function pick<T>(random: () => number, list: T[]): T {
  return list[Math.floor(random() * list.length)];
}

/** Valid demo evidence for any activity type, built from its own field specs */
function sampleEvidence(fields: readonly EvidenceField[], random: () => number) {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    switch (f.kind) {
      case 'text':
        out[f.name] = `Демо — ${f.label}`;
        break;
      case 'number':
        out[f.name] =
          f.name === 'pages' ? 24 + Math.floor(random() * 96) : 1 + Math.floor(random() * 4);
        break;
      case 'url':
        out[f.name] = f.hosts ? `https://${f.hosts[0]}/demo` : 'https://example.com/demo';
        break;
      case 'date':
        out[f.name] = `2026-${String(1 + Math.floor(random() * 9)).padStart(2, '0')}-15`;
        break;
      case 'isbn':
        out[f.name] = '978-3-16-148410-0';
        break;
      case 'doi':
        out[f.name] = '10.1000/demo.2026';
        break;
      case 'checkbox':
        out[f.name] = true;
        break;
      case 'select':
        out[f.name] = pick(random, [...f.options]).value;
        break;
    }
  }
  return out;
}

/**
 * Fills the given кафедри with invented НПП and scores them.
 *
 * The caller has already wiped and rebuilt the structure, so there is nothing
 * to clear here — `--rater` is destructive by way of the dispatcher, not by way
 * of a `--clear` flag this file used to own.
 *
 * Returns how many people were created.
 */
export async function seedRaterPopulation(
  prisma: PrismaClient,
  departmentIds: string[]
): Promise<number> {
  const template = await prisma.ratingTemplate.findFirst({
    where: { status: 'OPEN' },
    select: { id: true, year: true },
  });
  if (!template) {
    throw new Error('Немає активного рейтингового року. Спочатку запустіть pnpm db:seed.');
  }

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
  if (types.length === 0) {
    throw new Error('У активного року немає показників. Спочатку запустіть pnpm db:seed.');
  }

  const random = makeRandom(20260722);

  // ─── НПП ────────────────────────────────────────────────────────────────
  const taken = new Set<string>();
  const staffIds: string[] = [];

  for (const departmentId of departmentIds) {
    // Кафедри різного розміру — 8…20 НПП
    const size = 8 + Math.floor(random() * 13);

    for (let i = 0; i < size; i += 1) {
      const isFemale = random() < 0.55;
      const baseSurname = pick(random, SURNAMES);
      const lastName = isFemale ? feminine(baseSurname) : baseSurname;
      const firstName = pick(random, isFemale ? FEMALE_NAMES : MALE_NAMES);
      const patronymic = pick(random, isFemale ? FEMALE_PATRONYMICS : MALE_PATRONYMICS);

      let email = `${staffIds.length + 1}.${baseSurname.toLowerCase()}${DEMO_DOMAIN}`;
      while (taken.has(email)) email = `x${email}`;
      taken.add(email);

      const staff = await prisma.staff.create({
        data: {
          lastName,
          firstName,
          patronymic,
          email,
          isNpp: true,
          departmentId,
          role: 'USER',
          // No passwordHash: these are records to look at, not accounts to log in with
          pedagogicalExperience: 1 + Math.floor(random() * 35),
        },
        select: { id: true },
      });
      staffIds.push(staff.id);

      // Скільки показників має ця людина: більшість небагато, дехто майже все.
      // Квадрат рівномірного числа дає саме такий перекіс.
      const share = random() ** 2;
      const count = Math.round(share * types.length);
      if (count === 0) continue;

      const shuffled = [...types].sort(() => random() - 0.5).slice(0, count);
      const rows: Prisma.ActivityCreateManyInput[] = [];

      for (const type of shuffled) {
        const specs = parseTypeSpecs(type);
        // Validated through the real schema, so catalogue drift fails loudly here
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
          staffId: staff.id,
          activityTypeId: type.id,
          year: template.year,
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
  }

  console.log(`Створено НПП: ${staffIds.length}. Рахуємо бали…`);
  await recomputeRatingEntries(prisma, staffIds, template.year);

  return staffIds.length;
}
