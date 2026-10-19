import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import { buildKharakterystyka } from '../lib/kharakterystyka/build';
import { windowFor } from '../lib/kharakterystyka/positions';

// Takes rating 5.1 (Moodle) out of every Характеристика (owner, 2026-10-19).
//
//   pnpm db:kharakterystyka-drop-moodle            — report only, writes nothing
//   pnpm db:kharakterystyka-drop-moodle --apply    — write it, all in ONE transaction
//
// Linking 5.1 to п.4 was a mistake. Its lines reach a document two ways, and
// both go:
//
//   1. LIVE, through the indicator's `licencePositions`: every year's 5.1 is
//      unlinked — the CLOSED 2025 included, which the admin editor cannot edit,
//      and the open year, should an earlier script have linked it again.
//   2. STORED, the 2022–2024 backfill: every imported line printed as item 5.1
//      is HIDDEN (`removedAt`), exactly what a person's own «remove» does to an
//      imported line — so `db:import-kharakterystyka` can never bring it back.
//
// The rating is untouched: no entry, score or total moves. Lines a person TYPED
// into п.4 (MANUAL) stay — «електронний курс на освітній платформі» is theirs
// to claim, and п.4 names such courses itself. Кнпп is never stored, so it
// follows by itself; the report names whoever stops qualifying. Re-running is
// harmless: a second run finds nothing.

const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL!) });
const apply = process.argv.includes('--apply');
const YEAR = 2026;
const ITEM = '5.1';

const SEL = {
  year: true,
  status: true,
  evidence: true,
  activityTypeId: true,
  activityType: {
    select: {
      code: true,
      itemNumber: true,
      label: true,
      isActive: true,
      evidenceFields: true,
      licencePositions: true,
    },
  },
} as const;

/** One person's document — with or without the change applied */
async function build(staffId: string, change?: { unlink: Set<string>; hide: Set<string> }) {
  const { from, to } = windowFor(YEAR);
  const person = await prisma.staff.findUnique({
    where: { id: staffId },
    select: { isNpp: true, scientificDegree: true, degreeDefenceDate: true },
  });
  if (!person?.isNpp) return null;
  const [activities, entries] = await Promise.all([
    prisma.activity.findMany({ where: { staffId, year: { gte: from, lte: to } }, select: SEL }),
    prisma.kharakterystykaEntry.findMany({
      where: { staffId, year: { gte: from, lte: to }, removedAt: null },
      select: { id: true, position: true, group: true, year: true, text: true, itemNumber: true },
    }),
  ]);
  const acts = change
    ? activities.map((a) =>
        change.unlink.has(a.activityTypeId)
          ? { ...a, activityType: { ...a.activityType, licencePositions: [] } }
          : a
      )
    : activities;
  const kept = change ? entries.filter((e) => !change.hide.has(e.id)) : entries;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return buildKharakterystyka(acts as any, person, YEAR, kept);
}

async function main() {
  // 5.1 by its printed place, not its code — the 2025 year calls it item_5_1
  const types = await prisma.activityType.findMany({
    where: { itemNumber: ITEM, section: { number: 5 } },
    select: {
      id: true,
      code: true,
      licencePositions: true,
      template: { select: { year: true, status: true } },
    },
    orderBy: { template: { year: 'asc' } },
  });
  const linked = types.filter(
    (t) => Array.isArray(t.licencePositions) && t.licencePositions.length > 0
  );

  console.log('Показник 5.1 у кожному році:');
  for (const t of types) {
    const on = linked.includes(t);
    console.log(
      `  ${t.template.year} (${t.template.status}) ${t.code}: ` +
        (on
          ? `прив'язаний до ${JSON.stringify(t.licencePositions)} → відв'язати`
          : 'не прив’язаний')
    );
  }

  const imported = await prisma.kharakterystykaEntry.findMany({
    where: { source: 'IMPORT', itemNumber: ITEM, removedAt: null },
    select: { id: true, staffId: true, year: true, position: true },
  });
  const byYear = new Map<number, number>();
  for (const e of imported) byYear.set(e.year, (byYear.get(e.year) ?? 0) + 1);
  console.log(`\nІмпортовані рядки п. ${ITEM}: ${imported.length} → приховати`);
  for (const [y, n] of [...byYear].sort((a, b) => a[0] - b[0])) console.log(`  ${y}: ${n}`);

  // Who is touched at all: an imported line, or a counted 5.1 entry of a linked year
  const linkedIds = linked.map((t) => t.id);
  const { from, to } = windowFor(YEAR);
  const holders = linkedIds.length
    ? await prisma.activity.findMany({
        where: { activityTypeId: { in: linkedIds }, year: { gte: from, lte: to } },
        select: { staffId: true },
        distinct: ['staffId'],
      })
    : [];
  const people = [
    ...new Set([...imported.map((e) => e.staffId), ...holders.map((h) => h.staffId)]),
  ];

  const change = { unlink: new Set(linkedIds), hide: new Set(imported.map((e) => e.id)) };
  const dropped: string[] = [];
  let lostP4 = 0;
  for (const staffId of people) {
    const before = await build(staffId);
    const after = await build(staffId, change);
    if (!before || !after) continue;
    const p4 = (r: typeof before) => r.positions.find((p) => p.number === 4)?.met ?? false;
    if (p4(before) && !p4(after)) lostP4 += 1;
    if (before.qualifies && !after.qualifies) {
      const s = await prisma.staff.findUnique({
        where: { id: staffId },
        select: { lastName: true, firstName: true, department: { select: { name: true } } },
      });
      dropped.push(
        `${s?.lastName} ${s?.firstName} (${s?.department?.name ?? '—'}) ` +
          `${before.metCount} → ${after.metCount} позицій`
      );
    }
  }
  console.log(`\nОсіб зачеплено: ${people.length}; втрачає п.4: ${lostP4}`);
  console.log(`Випадає з Кнпп: ${dropped.length}`);
  for (const line of dropped) console.log(`  ⚠ ${line}`);

  if (linked.length === 0 && imported.length === 0) {
    console.log('\nНічого змінювати.');
    return;
  }
  if (!apply) {
    console.log('\nНічого не записано. Запустіть з --apply.');
    return;
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.activityType.updateMany({
      where: { id: { in: linkedIds } },
      data: { licencePositions: [] },
    });
    // removedBy stays empty: a script did this, not a person
    await tx.kharakterystykaEntry.updateMany({
      where: { id: { in: imported.map((e) => e.id) } },
      data: { removedAt: now },
    });
  });
  console.log(
    `\nЗаписано: відв'язано показників ${linked.length}, приховано рядків ${imported.length}.`
  );
  console.log('Кнпп перераховується сам — він ніде не зберігається.');
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
