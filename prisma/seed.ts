import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import { seedCatalogue } from './catalogue';
import { seedCoreAdmin } from './core-admin';
import { importRealStaff } from './staff-import';
import { seedStructure, wipePeople, wipeTemplates } from './structure';
import { TEST_DOMAIN, seedTestUniverse, testPassword } from './test-data';

// Three seeds, and each one answers a different question.
//
//   pnpm db:seed        «make an empty production database usable»
//   pnpm db:seed:staff  «put the real people in it»
//   pnpm db:seed:test   «give me a university I can click every button in»
//
// There were six modes until 2026-08-18 — catalogue, structure, demo, base,
// rater, prod — spread across four files that each invented their own people.
// Three of them created accounts, two wiped the database first, and telling
// which was which meant reading the source. The owner cut it to three.
//
// ── SAFE ─────────────────────────────────────────────────────────────────────
//
//   pnpm db:seed         PRODUCTION. The catalogue (six відділи, the 2026
//                        template with its indicators, додаток 5's
//                        спеціальності), the real 8 факультети and 31 кафедри,
//                        and nothing else. Every write is an upsert on a stable
//                        key, so it is safe to run again after an upgrade and a
//                        value an admin has since edited is left alone. Creates
//                        NO accounts — `pnpm db:create-admin` does that, and it
//                        asks who you are.
//
//   pnpm db:seed:staff   The real НПП, from `staff-roster.json`. Upserts on the
//                        email, so it can be re-run when the roster changes:
//                        somebody already there is updated, not duplicated.
//                        Nobody can sign in — no passwords are set; invitations
//                        go out from /admin/invites.
//
// ── DESTRUCTIVE ──────────────────────────────────────────────────────────────
//
//   pnpm db:seed:test    Wipes people, structure and rating templates, then
//                        builds a small complete university — see `test-data.ts`
//                        for what it guarantees. Refuses a database that already
//                        has accounts unless you pass `--force`.
//
// **The bare command is the safe one, deliberately.** `prisma db seed` also
// runs as part of `pnpm db:reset`, the command people type without thinking, so
// the mode it triggers must never be the one that deletes anything.

type Mode = 'prod' | 'staff' | 'test';

const MODES: Record<string, Mode> = {
  '--staff': 'staff',
  '--test': 'test',
};

function parseMode(argv: string[]): { mode: Mode; force: boolean } {
  const flags = argv.filter((arg) => arg.startsWith('--'));
  const force = flags.includes('--force');
  const modeFlags = flags.filter((flag) => flag !== '--force');

  const unknown = modeFlags.filter((flag) => !(flag in MODES));
  if (unknown.length > 0) {
    throw new Error(`Unknown flag ${unknown.join(', ')}. Use --staff or --test.`);
  }
  if (modeFlags.length > 1) {
    throw new Error(`Pick one mode, not ${modeFlags.join(' and ')}.`);
  }
  return { mode: modeFlags[0] ? MODES[modeFlags[0]]! : 'prod', force };
}

/**
 * Refuses to wipe a database that has people in it.
 *
 * The count is the test rather than an env var or a hostname: a database with
 * 300 staff and an audit log is somebody's real work whatever it is called, and
 * a database with none loses nothing. Says exactly what is there, because
 * «refusing» without naming the thing it protected reads as a broken script.
 */
async function refuseIfPopulated(prisma: PrismaClient): Promise<boolean> {
  const [staff, faculties, logs] = await Promise.all([
    prisma.staff.count(),
    prisma.faculty.count(),
    prisma.auditLog.count(),
  ]);
  if (staff === 0) return false;

  console.error('Відмовлено: у цій базі вже є дані, а режим --test стирає їх.\n');
  console.error(`  облікових записів: ${staff}`);
  console.error(`  факультетів:       ${faculties}`);
  console.error(`  записів у журналі: ${logs}\n`);
  console.error('Якщо це справді тестова база і ви хочете її очистити — додайте --force.');
  console.error('Для продакшн-бази потрібен інший режим:');
  console.error('  pnpm db:seed              каталог + факультети і кафедри');
  console.error('  pnpm db:create-admin      обліковий запис адміністратора');
  console.error('  pnpm db:seed:staff        реальні НПП з staff-roster.json');
  return true;
}

async function main() {
  const { mode, force } = parseMode(process.argv.slice(2));
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    // The roster import stands alone: it needs the structure to exist, but
    // rebuilding the catalogue first would say nothing useful about it.
    if (mode === 'staff') {
      await reportStaff(prisma);
      return;
    }

    if (mode === 'test') {
      if (!force && (await refuseIfPopulated(prisma))) {
        process.exitCode = 1;
        return;
      }
      await wipePeople(prisma);
      await wipeTemplates(prisma);
    }

    const catalogue = await seedCatalogue(prisma);
    console.log(
      `Каталог: ${catalogue.activityTypeCount} показників (${catalogue.year}), ` +
        `${Object.keys(catalogue.divisionIds).length} відділів, ` +
        `${catalogue.specialityCount} спеціальностей\n`
    );

    if (mode === 'prod') {
      const { departmentIds } = await seedStructure(prisma);
      console.log(`Структура: 8 факультетів, ${departmentIds.length} кафедр\n`);
      // A service account, not a person — see prisma/core-admin.ts. It can sign
      // in only when ADMIN_PASSWORD was given, so a production seed leaves the
      // row without a way in until somebody sets one deliberately.
      const admin = await seedCoreAdmin(prisma);
      console.log(
        `Основний адміністратор: ${admin.email} ` +
          (admin.canSignIn ? '(пароль встановлено)' : '(БЕЗ ПАРОЛЯ — увійти неможливо)')
      );

      console.log('\nГотово. Нічого не видалено, людей не створено.');
      console.log('Далі:');
      if (!admin.canSignIn) {
        console.log('  pnpm db:create-admin    задати пароль адміністратора');
      }
      console.log('  pnpm db:seed:staff      реальні НПП з staff-roster.json');
      return;
    }

    const test = await seedTestUniverse(prisma);
    console.log(
      `Структура: ${test.faculties} факультети, ${test.departments} кафедр, ` +
        `${test.staff} осіб (завідувачів ${test.heads}, деканів ${test.deans})`
    );
    console.log(`Заявок на здобувачів: ${test.claims} · без рейтингу: ${test.zeroRating}\n`);
    console.log('Увійти можна як:\n');
    for (const login of test.logins) {
      console.log(
        `  ${login.email.padEnd(26)} ${testPassword(login.role).padEnd(11)} ${login.note}`
      );
    }
    console.log(`\n  решта НПП — npp-NN-N@${TEST_DOMAIN}, пароль ${testPassword('USER')}`);
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * The roster import reports rather than throws when an address is unusable,
 * because the fix is somebody else's: those names go to whoever maintains the
 * list.
 */
async function reportStaff(prisma: PrismaClient) {
  const result = await importRealStaff(prisma);

  if (result.withoutEmail.length > 0 || result.duplicateEmails.length > 0) {
    console.error('Нічого не імпортовано — спочатку виправте адреси у списку.\n');
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

  console.log(
    `НПП: створено ${result.created}, оновлено ${result.updated}, ` +
      `сумісництво ${result.secondary}`
  );
  if (result.unknownDepartments.length > 0) {
    console.log(`\nКафедри, яких немає в базі (${result.unknownDepartments.length}):`);
    for (const name of result.unknownDepartments) console.log(`  ${name}`);
    console.log('Спершу: pnpm db:seed');
  }
  console.log('\nЖоден з них не може увійти — пароля немає.');
  console.log('Розішліть запрошення на /admin/invites, і кожен встановить свій.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
