import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import { seedCatalogue } from './catalogue';
import {
  DEMO_DOMAIN,
  DEMO_EMAILS,
  DEMO_PASSWORD,
  removeDemoUsers,
  seedDemoPopulation,
  seedDemoUsers,
} from './demo-users';
import { seedRaterPopulation } from './population';
import { SAMPLE_EMAILS, SAMPLE_PASSWORD, seedSamplePeople } from './sample-people';
import { importRealStaff } from './staff-import';
import { seedStructure, wipePeople, wipeTemplates } from './structure';

// One seed, six modes — three safe, three destructive.
//
// SAFE. Nothing is deleted; every write is an upsert on a stable key.
//
//   pnpm db:seed             catalogue only — divisions, the 2026 template with
//                            its 67 indicators, додаток 5's specialities. No
//                            people, no structure.
//   pnpm db:seed --structure + the real 8 факультети and 31 кафедри. This is
//                            what a fresh PRODUCTION database wants: it turns
//                            39 records somebody would otherwise type by hand
//                            into one command, and it touches nobody's account.
//   pnpm db:seed --demo      + six named accounts, one per screen worth
//                            showing, AND every кафедра filled: a завідувач
//                            plus three НПП each, with ratings that differ, so
//                            «Рейтинг НПП» and the charts have something to
//                            compare. All can sign in. Idempotent by email —
//                            somebody who already exists is left untouched,
//                            activities included, so a second run cannot double
//                            anybody's score. `--demo-remove` takes them away.
//
// DESTRUCTIVE. Each clears people, structure and rating templates first, so
// running one twice gives the same database rather than a second copy layered
// on the first.
//
//   pnpm db:seed --base      + nine invented accounts, one per role.
//   pnpm db:seed --rater     + ~200 invented НПП with ratings from zero to full,
//                            so the charts and the rating pages have something
//                            to say.
//   pnpm db:seed --prod      + the real НПП from the university's spreadsheet,
//                            every account locked until an ADMIN invites them.
//
// **The bare command is the safe one, deliberately.** `prisma db seed` also runs
// as part of `pnpm db:reset`, which is the command people type without thinking
// — so the mode it triggers must never be the one that loads 300 real
// colleagues into whatever database happens to be configured.
//
// **And a destructive mode now refuses a populated database** (2026-08-17). It
// used to call `wipePeople()` on whatever `DATABASE_URL` pointed at, with no
// question asked: `staff.deleteMany()`, `department.deleteMany()`,
// `faculty.deleteMany()`, `auditLog.deleteMany()`. Run against production —
// which is exactly where somebody would reach for `--prod` — that deletes the
// administrator account, the structure typed in by hand, and the whole audit
// log, and then creates people again on the bare floor. `--force` still does it
// for the dev database it was written for.
//
// All modes share the same real факультети and кафедри, so the кафедра pickers,
// the ставка grid and the випускова-кафедра colours behave the way they will on
// the day.

type Mode = 'catalogue' | 'structure' | 'demo' | 'base' | 'rater' | 'prod';

const MODES: Record<string, Mode> = {
  '--structure': 'structure',
  '--demo': 'demo',
  '--demo-remove': 'demo',
  '--base': 'base',
  '--rater': 'rater',
  '--prod': 'prod',
};

/** The modes that call `wipePeople` before they write anything */
const DESTRUCTIVE: ReadonlySet<Mode> = new Set<Mode>(['base', 'rater', 'prod']);

function parseMode(argv: string[]): { mode: Mode; force: boolean; removeDemo: boolean } {
  const flags = argv.filter((arg) => arg.startsWith('--'));
  const force = flags.includes('--force');
  const removeDemo = flags.includes('--demo-remove');
  const modeFlags = flags.filter((flag) => flag !== '--force');

  const unknown = modeFlags.filter((flag) => !(flag in MODES));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown flag ${unknown.join(', ')}. Use --structure, --demo, --demo-remove, --base, --rater or --prod.`
    );
  }
  if (modeFlags.length > 1) {
    throw new Error(`Pick one mode, not ${modeFlags.join(' and ')}.`);
  }
  return { mode: modeFlags[0] ? MODES[modeFlags[0]]! : 'catalogue', force, removeDemo };
}

/**
 * Refuses to wipe a database that has people in it.
 *
 * The count is the test rather than an env var or a hostname: a database with
 * 300 staff and an audit log is somebody's real work whatever it is called, and
 * a database with none loses nothing. Says exactly what is there, because
 * «refusing» without naming the thing it protected reads as a broken script.
 */
async function refuseIfPopulated(prisma: PrismaClient, mode: Mode): Promise<boolean> {
  const [staff, faculties, logs] = await Promise.all([
    prisma.staff.count(),
    prisma.faculty.count(),
    prisma.auditLog.count(),
  ]);
  if (staff === 0) return false;

  console.error(`Відмовлено: у цій базі вже є дані, а режим --${mode} стирає їх.\n`);
  console.error(`  облікових записів: ${staff}`);
  console.error(`  факультетів:       ${faculties}`);
  console.error(`  записів у журналі: ${logs}\n`);
  console.error('Якщо це справді дев-база і ви хочете її очистити — додайте --force.');
  console.error('Для порожньої продакшн-бази потрібен інший режим:');
  console.error('  pnpm db:seed              каталог показників');
  console.error('  pnpm db:seed:structure    + факультети і кафедри');
  console.error('  pnpm db:create-admin      обліковий запис адміністратора');
  return true;
}

async function main() {
  const { mode, force, removeDemo } = parseMode(process.argv.slice(2));
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    // Clearing up after a demo touches nothing else, so it runs on its own and
    // does not need the catalogue rebuilt first.
    if (removeDemo) {
      const removed = await removeDemoUsers(prisma);
      console.log(
        removed === 0
          ? 'Демо-акаунтів не знайдено — нічого не видалено.'
          : `Видалено ${removed} демо-акаунтів (@${DEMO_DOMAIN}). Інших записів не торкалися.`
      );
      return;
    }

    if (DESTRUCTIVE.has(mode)) {
      if (!force && (await refuseIfPopulated(prisma, mode))) {
        process.exitCode = 1;
        return;
      }
      await wipePeople(prisma);
      await wipeTemplates(prisma);
    }

    const catalogue = await seedCatalogue(prisma);

    console.log(`Каталог: ${catalogue.activityTypeCount} показників (${catalogue.year}), `);
    console.log(`         ${Object.keys(catalogue.divisionIds).length} відділів, `);
    console.log(`         ${catalogue.specialityCount} спеціальностей\n`);

    if (mode === 'catalogue') {
      console.log('Готово. Людей і структури не створено — це режим за замовчуванням.');
      console.log('Факультети і кафедри:            pnpm db:seed:structure');
      console.log('Обліковий запис адміністратора:  pnpm db:create-admin');
      return;
    }

    const { departmentIds } = await seedStructure(prisma);
    console.log(`Структура: 8 факультетів, ${departmentIds.length} кафедр\n`);

    if (mode === 'structure') {
      console.log('Готово. Нічого не видалено, людей не створено.');
      console.log('Обліковий запис адміністратора: pnpm db:create-admin');
      return;
    }

    if (mode === 'demo') {
      const demo = await seedDemoUsers(prisma);
      console.log(`Демо-акаунти: створено ${demo.created}, оновлено ${demo.updated}\n`);

      const pop = await seedDemoPopulation(prisma);
      console.log(
        `Кафедри: ${pop.departments} · створено ${pop.created} осіб, пропущено ${pop.skipped} (вже були)`
      );
      console.log(`Завідувачів призначено: ${pop.headsSet}, залишено чужих: ${pop.headsTaken}\n`);

      if (demo.headTaken) {
        console.log(`  Завідувача НЕ змінено — кафедру вже веде ${demo.headTaken}`);
      }
      if (demo.deanTaken) {
        console.log(`  Декана НЕ змінено — факультет уже веде ${demo.deanTaken}`);
      }
      console.log(`Пароль для всіх: ${DEMO_PASSWORD}`);
      for (const email of DEMO_EMAILS) console.log(`  ${email}`);
      console.log('\nНічого не видалено. Прибрати після показу: pnpm db:seed:demo:remove');
      return;
    }

    if (mode === 'prod') {
      await reportProd(prisma);
      return;
    }

    const people = await seedSamplePeople(prisma, {
      departmentIds,
      nnvDivisionId: catalogue.divisionIds.NNV!,
    });

    if (mode === 'rater') {
      const added = await seedRaterPopulation(prisma, departmentIds);
      console.log(`Демо-НПП: ${added} осіб з рейтингами\n`);
    }

    console.log(`Пароль для всіх ${people} облікових записів: ${SAMPLE_PASSWORD}`);
    for (const email of SAMPLE_EMAILS) console.log(`  ${email}`);
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * The real import reports rather than throws when the spreadsheet's addresses
 * are not usable, because the fix is somebody else's: those names go to whoever
 * maintains the sheet.
 */
async function reportProd(prisma: PrismaClient) {
  const result = await importRealStaff(prisma);

  if (result.withoutEmail.length > 0 || result.duplicateEmails.length > 0) {
    console.error('Нічого не імпортовано — спочатку виправте адреси у таблиці.\n');
    if (result.duplicateEmails.length > 0) {
      console.error(`Одна адреса на кількох людей (${result.duplicateEmails.length}):`);
      for (const line of result.duplicateEmails) console.error(`  ${line}`);
    }
    if (result.withoutEmail.length > 0) {
      console.error(`\nБез адреси (${result.withoutEmail.length}):`);
      for (const pib of result.withoutEmail) console.error(`  ${pib}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`НПП: ${result.imported} осіб, завідувачів призначено: ${result.heads}\n`);
  console.log('Жоден з них не може увійти — пароля немає.');
  console.log('Розішліть запрошення на /admin/invites, і кожен встановить свій.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
