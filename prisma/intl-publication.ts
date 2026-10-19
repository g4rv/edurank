import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import type { Prisma } from '../lib/generated/prisma/client';
import { catalogueType } from '../lib/rating/db-specs';

// The new 3.10 «Міжнародна публікація у рецензованому науковому виданні»
// (owner, 2026-10-16) in a database that already has the year in it.
//
//   pnpm db:intl-publication            — report only, writes nothing
//   pnpm db:intl-publication --apply    — write it, all in ONE transaction
//
// In every NOT-closed year that has 3.9 (`publication_cat_b`) and not yet the
// new indicator:
//
//   1. Section 3's numbers from 3.10 up move one on — 3.10 → 3.11 … 3.25 → 3.26 —
//      and their order with them. Entries are tied to their indicator by id,
//      never by number, so no entry moves and no score changes (tested on a
//      copy of production, 2026-10-16: 0 entries and 0 totals changed).
//   2. The new indicator goes in as 3.10, right after 3.9, from the catalogue.
//
// A CLOSED year keeps its own numbers. Re-running is harmless: a year that
// already has the indicator is skipped.

const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL!) });
const apply = process.argv.includes('--apply');

const NEW_CODE = 'intl_peer_reviewed_publication';
const AFTER_CODE = 'publication_cat_b';
/** The first number that moves: 3.10 */
const FIRST_MOVED = 10;

async function main() {
  const target = catalogueType(NEW_CODE);
  const templates = await prisma.ratingTemplate.findMany({
    where: { status: { not: 'CLOSED' } },
    select: { id: true, year: true },
    orderBy: { year: 'asc' },
  });

  const writes: ((tx: Prisma.TransactionClient) => Promise<unknown>)[] = [];

  for (const tpl of templates) {
    const section3 = await prisma.activityType.findMany({
      where: { templateId: tpl.id, section: { number: 3 } },
      select: { id: true, code: true, itemNumber: true, order: true, sectionId: true },
      orderBy: { order: 'asc' },
    });
    if (section3.some((t) => t.code === NEW_CODE)) {
      console.log(`\n• ${tpl.year}: п. 3.10 вже є — пропущено`);
      continue;
    }
    const after = section3.find((t) => t.code === AFTER_CODE);
    if (!after) {
      console.log(`\n• ${tpl.year}: немає п. 3.9 (${AFTER_CODE}) — пропущено`);
      continue;
    }

    console.log(`\n• ${tpl.year}`);
    // Order first, from the end, so no two rows ever share an order mid-way
    const moved = section3.filter((t) => t.order > after.order).reverse();
    for (const t of moved) {
      const [major, minor] = t.itemNumber.split('.').map(Number);
      const renumber = major === 3 && minor >= FIRST_MOVED;
      const nextNumber = renumber ? `3.${minor + 1}` : t.itemNumber;
      if (renumber) console.log(`    п. ${t.itemNumber} → п. ${nextNumber}  (${t.code})`);
      writes.push((tx) =>
        tx.activityType.update({
          where: { id: t.id },
          data: { order: t.order + 1, itemNumber: nextNumber },
        })
      );
    }
    console.log(
      `    + п. ${target.specs.itemNumber} «${target.def.label}» — ${target.def.coefficient} балів`
    );
    writes.push((tx) =>
      tx.activityType.create({
        data: {
          templateId: tpl.id,
          sectionId: after.sectionId,
          code: NEW_CODE,
          order: after.order + 1,
          label: target.def.label,
          itemNumber: target.specs.itemNumber,
          maxPerYear: target.specs.maxPerYear,
          requiresVerification: target.specs.requiresVerification,
          entityFirstEntry: target.specs.entityFirstEntry,
          gatesRating: target.specs.gatesRating,
          evidenceFields: target.specs.evidenceFields as unknown as Prisma.InputJsonValue,
          scoring: target.specs.scoring as unknown as Prisma.InputJsonValue,
          licencePositions: target.specs.licencePositions as unknown as Prisma.InputJsonValue,
          coefficient: target.def.coefficient,
          coefficientNote: target.def.coefficientNote ?? null,
          inputSource: target.def.inputSource,
          verifyingDivisionId: null,
          isActive: true,
        },
      })
    );
  }

  if (writes.length === 0) {
    console.log('\nНічого змінювати.');
    return;
  }
  if (!apply) {
    console.log('\nНічого не записано. Запустіть з --apply.');
    return;
  }

  await prisma.$transaction(
    async (tx) => {
      for (const w of writes) await w(tx);
    },
    { timeout: 120_000 }
  );
  console.log('\nЗаписано.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
