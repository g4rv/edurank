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
// One exception, for the POSITION only (owner, 2026-11-24, when 7.4 joined the
// list): a line inserted in the middle moves every line after it, so the stored
// `order` of an existing line is brought to the catalogue's. Nothing else on an
// existing line is ever written — label, points, switch and mapping stay as the
// admin left them, and a report keeps its values (they are keyed by line id).
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

  // Existing lines whose place in the list is no longer the catalogue's
  const stored = await prisma.departmentIndicator.findMany({
    where: { year },
    select: { id: true, itemNumber: true, order: true },
  });
  const wanted = new Map(rows.map((r) => [r.itemNumber, r.order]));
  const moved = stored.filter(
    (r) => wanted.has(r.itemNumber) && wanted.get(r.itemNumber) !== r.order
  );

  console.log(`Рейтинг кафедри ${year}: рядків уже є ${existing.size}, бракує ${missing.length}.`);
  for (const row of missing) console.log(`  + ${row.itemNumber} — ${row.label}`);
  if (moved.length > 0) console.log(`Зміниться лише місце в списку: ${moved.length} рядків.`);

  if (missing.length === 0 && moved.length === 0) {
    console.log('\nНічого створювати: каталог повний.');
    return;
  }
  if (!apply) {
    console.log('\nЗапустіть з --apply, щоб записати.');
    return;
  }

  await prisma.$transaction(async (tx) => {
    // Positions first, so the new line never shares a place with an old one
    for (const r of moved) {
      await tx.departmentIndicator.update({
        where: { id: r.id },
        data: { order: wanted.get(r.itemNumber)! },
      });
    }
    if (missing.length > 0) await tx.departmentIndicator.createMany({ data: missing });
  });
  console.log(`\nГотово. Створено рядків: ${missing.length}, переставлено: ${moved.length}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
