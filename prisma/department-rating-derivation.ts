import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../lib/generated/prisma/client';
import {
  DEPARTMENT_INDICATORS_2026,
  DERIVATIONS_2026,
} from '../lib/department-rating/catalogue-2026';

// How an existing database gets Рейтинг кафедри's links to the personal rating
// (owner, 2026-11-16): which lines are counted from the staff's own entries.
//
// Why a script and not `pnpm db:seed`: production is never seeded again, and a
// cloned year is never reseeded. This touches one column of one table.
//
// Every year's lines, matched by item number. CREATE-ONLY: a line whose
// `derivation` is already set is never changed, so a second run changes
// nothing, and a line the map does not name stays typed by hand.
//
//   pnpm db:department-rating-derivation            reports
//   pnpm db:department-rating-derivation --apply    writes

const apply = process.argv.includes('--apply');

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function main() {
  const rows = await prisma.departmentIndicator.findMany({
    where: { itemNumber: { in: Object.keys(DERIVATIONS_2026) } },
    select: { id: true, year: true, itemNumber: true, kind: true, label: true, derivation: true },
    orderBy: [{ year: 'asc' }, { order: 'asc' }],
  });

  // A later year may renumber its lines: link only a line that is still the
  // 2026 one — a COUNT under the same label — and name every other
  const labels = new Map(DEPARTMENT_INDICATORS_2026.map((d) => [d.itemNumber, d.label]));
  const same = (r: (typeof rows)[number]) =>
    r.kind === 'COUNT' && r.label === labels.get(r.itemNumber);
  const todo = rows.filter((r) => r.derivation === null && same(r));
  const skipped = rows.filter((r) => !same(r));

  console.log(
    `Рейтинг кафедри: рядків у мапі ${rows.length}, уже пов’язано ${
      rows.length - todo.length - skipped.length
    }, пов’язати ${todo.length}.`
  );
  for (const r of todo) {
    console.log(`  + ${r.year} · ${r.itemNumber} — ${DERIVATIONS_2026[r.itemNumber].coverage}`);
  }
  for (const r of skipped) {
    console.log(`  ! ${r.year} · ${r.itemNumber} — інший рядок, ніж у 2026, пропущено`);
  }

  if (todo.length === 0) {
    console.log('\nНічого змінювати.');
    return;
  }
  if (!apply) {
    console.log('\nЗапустіть з --apply, щоб записати.');
    return;
  }

  await prisma.$transaction(
    todo.map((r) =>
      prisma.departmentIndicator.update({
        where: { id: r.id },
        data: { derivation: DERIVATIONS_2026[r.itemNumber] as unknown as Prisma.InputJsonValue },
      })
    )
  );
  console.log(`\nГотово. Пов’язано рядків: ${todo.length}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
