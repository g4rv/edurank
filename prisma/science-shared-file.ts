import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import { SCIENCE_WORK_TYPES_2027 } from '../lib/science/work-types-2027';

// A conference programme is ONE stored file that several colleagues connect to
// (owner, 2026-11-13): it names every presenter and the organisers issue no
// certificate, so «the same file» is correct work there. The setting is the
// column `ScienceWorkType.sharedFile`; for every OTHER вид роботи a file still
// belongs to one record, university-wide (D28).
//
//   pnpm db:science-shared-file            — report only, writes nothing
//   pnpm db:science-shared-file --apply    — write it, in one transaction
//
// Why a script: the column was added by a migration with the default `false`, so
// a database made before it knows nothing about the conference types, a cloned
// planning year is never reseeded, and production is never seeded again.
//
// Narrow on purpose: it sets `sharedFile = true` on the вид роботи the CATALOGUE
// marks (`SCIENCE_WORK_TYPES_2027`, by `code` — the stable key), in EVERY year,
// and touches nothing else. It never switches the flag OFF: an ADMIN who set it
// on another вид by hand keeps it. Run after `prisma migrate deploy`.

const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL!) });
const apply = process.argv.includes('--apply');

const SHARED_CODES = SCIENCE_WORK_TYPES_2027.filter((d) => d.sharedFile).map((d) => d.code);

async function main() {
  console.log(
    `Види роботи, де один файл можуть використати кілька НПП: ${SHARED_CODES.join(', ')}\n`
  );

  const types = await prisma.scienceWorkType.findMany({
    where: { code: { in: SHARED_CODES } },
    select: {
      id: true,
      code: true,
      sharedFile: true,
      template: { select: { academicYear: true, status: true } },
      _count: { select: { works: true } },
    },
    orderBy: [{ template: { academicYear: 'asc' } }, { code: 'asc' }],
  });

  const toChange = types.filter((t) => !t.sharedFile);
  for (const t of types) {
    console.log(
      `  ${t.sharedFile ? '=' : '+'} ${t.template.academicYear} (${t.template.status}) ${t.code}  ` +
        `робіт: ${t._count.works}${t.sharedFile ? '  — вже увімкнено' : ''}`
    );
  }
  console.log(`\nВидів: ${types.length}; потребують змін: ${toChange.length}`);

  if (!apply) {
    console.log('Нічого не записано. Запустіть з --apply, щоб записати.');
    return;
  }
  await prisma.scienceWorkType.updateMany({
    where: { id: { in: toChange.map((t) => t.id) } },
    data: { sharedFile: true },
  });
  console.log(`Записано: ${toChange.length}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
