import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import type { Prisma } from '../lib/generated/prisma/client';
import { catalogueType } from '../lib/rating/db-specs';
import { computeScore } from '../lib/specs/scoring';
import { recomputeRatingEntries } from '../lib/rating/recompute';

// 5.1 «Я лектор» (owner, 2026-10-16) reaches a database that already has the
// year in it. The migration `20261016150000_activity_type_gates_rating` adds the
// column first; this switches 5.1 to the new rule.
//
//   pnpm db:lecturer-gate            — report only, writes nothing
//   pnpm db:lecturer-gate --apply    — write it, all in ONE transaction
//
// What it does, in every NOT-closed year that has 5.1 (`moodle_course`):
//
//   1. The indicator: the new form («Я лектор» first, every other box behind
//      it), no points (FIXED, coefficient 0), `gatesRating` on, and its
//      Характеристика п.4 link only for a lecturer. This REPLACES the form an
//      admin may have edited on 5.1 — read the report.
//   2. Its saved entries: kept as they are, marked «Я лектор» (they all name
//      a course and a link already), and re-scored to 0. They count as a
//      filled 5.1, so those people are not blocked.
//   3. Every person's year total is recomputed with the new rule: somebody with
//      no 5.1 entry now counts as 0 until they fill it. Printed «було» → «стало».
//
// A CLOSED year is not touched — its ranking is frozen history.
// Re-running is harmless: a second run changes nothing.

const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL!) });
const apply = process.argv.includes('--apply');

const comma = (n: number) => String(n).replace('.', ',');

async function main() {
  const target = catalogueType('moodle_course');
  const types = await prisma.activityType.findMany({
    where: { code: 'moodle_course', template: { status: { not: 'CLOSED' } } },
    select: {
      id: true,
      itemNumber: true,
      coefficient: true,
      gatesRating: true,
      scoring: true,
      template: { select: { year: true } },
    },
  });
  if (types.length === 0) {
    console.log('Немає відкритого року з п. 5.1 (moodle_course). Нічого змінювати.');
    return;
  }

  const writes: ((tx: Prisma.TransactionClient) => Promise<unknown>)[] = [];
  const years = new Set<number>();

  for (const t of types) {
    const year = t.template.year;
    years.add(year);
    const kind = (t.scoring as { kind?: string } | null)?.kind;
    console.log(`\n• ${year}, п. ${t.itemNumber}`);
    console.log(
      `    правило: ${kind} × ${comma(t.coefficient)} → FIXED × 0 (без балів); ` +
        `спершу заповнити: ${t.gatesRating ? 'так' : 'ні'} → так; форма — нова («Я лектор»)`
    );
    writes.push((tx) =>
      tx.activityType.update({
        where: { id: t.id },
        data: {
          evidenceFields: target.specs.evidenceFields as unknown as Prisma.InputJsonValue,
          scoring: target.specs.scoring as unknown as Prisma.InputJsonValue,
          licencePositions: target.specs.licencePositions as unknown as Prisma.InputJsonValue,
          coefficient: target.def.coefficient,
          coefficientNote: target.def.coefficientNote ?? null,
          gatesRating: true,
        },
      })
    );

    const entries = await prisma.activity.findMany({
      where: { activityTypeId: t.id },
      select: {
        id: true,
        score: true,
        status: true,
        evidence: true,
        staff: { select: { lastName: true, firstName: true } },
      },
      orderBy: { staff: { lastName: 'asc' } },
    });
    let changed = 0;
    for (const a of entries) {
      const evidence = (a.evidence ?? {}) as Record<string, unknown>;
      const next = evidence.isLecturer === undefined ? { isLecturer: true, ...evidence } : evidence;
      const { computedValue, score } = computeScore(
        { ...target, coefficient: target.def.coefficient },
        next
      );
      if (a.score === score && next === evidence) continue;
      changed += 1;
      console.log(
        `    ${a.staff.lastName} ${a.staff.firstName} (${a.status}): бали ${comma(a.score)} → ${comma(score)}` +
          `${next !== evidence ? ', «Я лектор»' : ''}`
      );
      writes.push((tx) =>
        tx.activity.update({
          where: { id: a.id },
          data: { evidence: next as Prisma.InputJsonValue, computedValue, score },
        })
      );
    }
    console.log(`    записів п. 5.1: ${entries.length}, змінюється: ${changed}`);
  }

  // Everyone with a total in those years, before → after
  const before = await prisma.ratingEntry.findMany({
    where: { year: { in: [...years] } },
    select: {
      staffId: true,
      year: true,
      totalScore: true,
      staff: { select: { lastName: true, firstName: true } },
    },
    orderBy: { staff: { lastName: 'asc' } },
  });

  const run = async (tx: Prisma.TransactionClient) => {
    for (const w of writes) await w(tx);
    for (const year of years) {
      await recomputeRatingEntries(
        tx,
        before.filter((e) => e.year === year).map((e) => e.staffId),
        year
      );
    }
    return tx.ratingEntry.findMany({
      where: { year: { in: [...years] } },
      select: { staffId: true, year: true, totalScore: true },
    });
  };

  // The totals are computed by the same code either way: a report runs the
  // whole change inside a transaction and rolls it back, so it prints exactly
  // what --apply would leave behind.
  class Rollback extends Error {
    constructor(public readonly after: { staffId: string; year: number; totalScore: number }[]) {
      super('rollback');
    }
  }
  let after: { staffId: string; year: number; totalScore: number }[] = [];
  try {
    await prisma.$transaction(
      async (tx) => {
        const result = await run(tx);
        if (!apply) throw new Rollback(result);
        after = result;
      },
      { timeout: 300_000 }
    );
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
    after = e.after;
  }

  const afterOf = new Map(after.map((e) => [`${e.staffId}:${e.year}`, e.totalScore]));
  const moved = before.filter((e) => afterOf.get(`${e.staffId}:${e.year}`) !== e.totalScore);
  const zeroed = moved.filter((e) => afterOf.get(`${e.staffId}:${e.year}`) === 0);
  console.log(`\nПідсумки року: змінюються ${moved.length} з ${before.length}`);
  for (const e of moved) {
    console.log(
      `    ${e.staff.lastName} ${e.staff.firstName} (${e.year}): ${comma(e.totalScore)} → ` +
        `${comma(afterOf.get(`${e.staffId}:${e.year}`) ?? 0)}`
    );
  }
  console.log(
    `\nДо 0 — бо п. 5.1 ще не заповнено: ${zeroed.length}. ` +
      'Їхні бали повернуться, щойно вони заповнять п. 5.1.'
  );
  console.log(apply ? '\nЗаписано.' : '\nНічого не записано. Запустіть з --apply.');
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
