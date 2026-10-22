import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import { departmentIndicatorRows } from './catalogue';

// How PRODUCTION gets Рейтинг кафедри's scored lines (2026-10-20).
//
// Why a script and not `pnpm db:seed`: production is never seeded again, and
// the seed also overwrites the personal rating's indicators an admin edited.
// This touches one table.
//
// For the ACTIVE rating year only — the one a завідувач fills. CREATE-ONLY: a
// line that exists is never updated or deleted, so a second run changes
// nothing.
//
//   pnpm db:department-rating-catalogue            reports
//   pnpm db:department-rating-catalogue --apply    writes

const apply = process.argv.includes('--apply');

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function main() {
  const template = await prisma.ratingTemplate.findFirst({
    where: { isActive: true },
    select: { year: true },
  });
  if (!template) {
    console.log('Активного рейтингового року немає — нічого створювати.');
    return;
  }
  const { year } = template;

  const rows = departmentIndicatorRows(year);
  const existing = new Set(
    (
      await prisma.departmentIndicator.findMany({ where: { year }, select: { itemNumber: true } })
    ).map((r) => r.itemNumber)
  );
  const missing = rows.filter((r) => !existing.has(r.itemNumber));

  console.log(`Рейтинг кафедри ${year}: рядків уже є ${existing.size}, бракує ${missing.length}.`);
  for (const row of missing) console.log(`  + ${row.itemNumber} — ${row.label}`);

  if (missing.length === 0) {
    console.log('\nНічого створювати: каталог повний.');
    return;
  }
  if (!apply) {
    console.log('\nЗапустіть з --apply, щоб записати.');
    return;
  }

  await prisma.departmentIndicator.createMany({ data: missing });
  console.log(`\nГотово. Створено рядків: ${missing.length}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
