import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import type { Prisma } from '../lib/generated/prisma/client';
import { catalogueType } from '../lib/rating/db-specs';

// The new 3.11 «Наукові публікації, що мають цифровий ідентифікатор DOI та не
// належать до категорій «А» і «Б»» (owner, 2026-10-27) in a database that
// already has the year in it. The same move as `db:intl-publication` for 3.10.
//
//   pnpm db:doi-publication            — report only, writes nothing
//   pnpm db:doi-publication --apply    — write it, all in ONE transaction
//
// In every NOT-closed year that has 3.10 (`intl_peer_reviewed_publication`)
// and not yet the new indicator — so `db:intl-publication` runs FIRST:
//
//   1. Section 3's numbers from 3.11 up move one on — 3.11 → 3.12 … 3.26 → 3.27 —
//      and their order with them. Entries are tied to their indicator by id,
//      never by number, so no entry moves and no score changes.
//   2. The new indicator goes in as 3.11, right after 3.10, from the catalogue.
//
// A CLOSED year keeps its own numbers. Re-running is harmless: a year that
// already has the indicator is not renumbered again — only its FORM is brought
// up to the catalogue's when they differ.

const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL!) });
const apply = process.argv.includes('--apply');

const NEW_CODE = 'doi_publication';
const AFTER_CODE = 'intl_peer_reviewed_publication';
/** The first number that moves: 3.11 */
const FIRST_MOVED = 11;

/** Equal as JSON, whatever the key order — Postgres's jsonb stores its own */
function sameJson(a: unknown, b: unknown): boolean {
  const sorted = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(sorted)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, sorted((v as Record<string, unknown>)[k])])
          )
        : v;
  return JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
}

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
      select: {
        id: true,
        code: true,
        itemNumber: true,
        order: true,
        sectionId: true,
        evidenceFields: true,
      },
      orderBy: { order: 'asc' },
    });
    const existing = section3.find((t) => t.code === NEW_CODE);
    if (existing) {
      if (sameJson(existing.evidenceFields, target.specs.evidenceFields)) {
        console.log(`\n• ${tpl.year}: п. 3.11 вже є — пропущено`);
      } else {
        console.log(`\n• ${tpl.year}: п. 3.11 вже є — форму оновлено до каталогу`);
        writes.push((tx) =>
          tx.activityType.update({
            where: { id: existing.id },
            data: {
              evidenceFields: target.specs.evidenceFields as unknown as Prisma.InputJsonValue,
            },
          })
        );
      }
      continue;
    }
    const after = section3.find((t) => t.code === AFTER_CODE);
    if (!after) {
      console.log(`\n• ${tpl.year}: немає п. 3.10 (${AFTER_CODE}) — пропущено`);
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
