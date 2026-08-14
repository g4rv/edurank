import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import { seedCatalogue } from './catalogue';
import { seedRaterPopulation } from './population';
import { SAMPLE_EMAILS, SAMPLE_PASSWORD, seedSamplePeople } from './sample-people';
import { importRealStaff } from './staff-import';
import { seedStructure, wipePeople, wipeTemplates } from './structure';

// One seed, four modes.
//
//   pnpm db:seed            catalogue only — divisions, the 2026 template with
//                           its 67 indicators, додаток 5's specialities. No
//                           people, no structure. Idempotent, destroys nothing.
//   pnpm db:seed --base     + the real 8 факультети / 31 кафедри and nine
//                           invented accounts, one per role.
//   pnpm db:seed --rater    + ~200 invented НПП with ratings from zero to full,
//                           so the charts and the rating pages have something
//                           to say.
//   pnpm db:seed --prod     + the real НПП from the university's spreadsheet,
//                           every account locked until an ADMIN invites them.
//
// **The bare command is the safe one, deliberately.** `prisma db seed` also runs
// as part of `pnpm db:reset`, which is the command people type without thinking
// — so the mode it triggers must never be the one that loads 300 real
// colleagues into whatever database happens to be configured.
//
// The three flagged modes are DESTRUCTIVE: they clear people, structure and
// rating templates first, so running one twice gives the same database rather
// than a second copy layered on the first. The bare mode is not.
//
// All modes share the same real факультети and кафедри, so the кафедра pickers,
// the ставка grid and the випускова-кафедра colours behave the way they will on
// the day.

type Mode = 'catalogue' | 'base' | 'rater' | 'prod';

const MODES: Record<string, Mode> = {
  '--base': 'base',
  '--rater': 'rater',
  '--prod': 'prod',
};

function parseMode(argv: string[]): Mode {
  const flags = argv.filter((arg) => arg.startsWith('--'));
  const unknown = flags.filter((flag) => !(flag in MODES));
  if (unknown.length > 0) {
    throw new Error(`Unknown flag ${unknown.join(', ')}. Use --base, --rater or --prod.`);
  }
  if (flags.length > 1) {
    throw new Error(`Pick one mode, not ${flags.join(' and ')}.`);
  }
  return flags[0] ? MODES[flags[0]]! : 'catalogue';
}

async function main() {
  const mode = parseMode(process.argv.slice(2));
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    if (mode !== 'catalogue') {
      await wipePeople(prisma);
      await wipeTemplates(prisma);
    }

    const catalogue = await seedCatalogue(prisma);

    console.log(`Каталог: ${catalogue.activityTypeCount} показників (${catalogue.year}), `);
    console.log(`         ${Object.keys(catalogue.divisionIds).length} відділів, `);
    console.log(`         ${catalogue.specialityCount} спеціальностей\n`);

    if (mode === 'catalogue') {
      console.log('Готово. Людей і структури не створено — це режим за замовчуванням.');
      console.log('Обліковий запис адміністратора: pnpm db:create-admin');
      return;
    }

    const { departmentIds } = await seedStructure(prisma);
    console.log(`Структура: 8 факультетів, ${departmentIds.length} кафедр\n`);

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
