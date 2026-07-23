import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import type { Prisma } from '../lib/generated/prisma/client';

// One-time cleanup for the float-dust bug: before this fix, RatingEntry section
// columns, totalScore, and the closed-year snapshot subtotals/total were sums of
// 2-decimal scores added with `+`, so they stored values like 3155.0000000000005.
// The scoring itself was always right — only the sums carried the dust.
//
// This re-rounds the stored values in place. It does NOT recompute from
// Activity, so it cannot change any real total — round2 can only strip the dust
// (round2(3155.0000000000005) === 3155, round2(3155.5) === 3155.5). That makes it
// safe to run on closed years too: their history stays exactly what it was, just
// without the trailing noise.
//
//   pnpm db:fix-rounding

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** A rounded copy of a value, and whether rounding actually changed it */
function clean(n: number): { value: number; changed: boolean } {
  const value = round2(n);
  return { value, changed: value !== n };
}

interface SnapshotShape {
  closedAt: string;
  total: number;
  sections: {
    number: number;
    title: string;
    subtotal: number;
    items: { score: number; [k: string]: unknown }[];
  }[];
}

/** Re-round a snapshot's subtotals/total/item scores; returns null if nothing changed */
function cleanSnapshot(snapshot: unknown): SnapshotShape | null {
  const s = snapshot as SnapshotShape | null;
  if (!s || !Array.isArray(s.sections)) return null;

  let changed = false;
  const sections = s.sections.map((section) => {
    const items = section.items.map((item) => {
      const r = clean(item.score);
      if (r.changed) changed = true;
      return { ...item, score: r.value };
    });
    const st = clean(section.subtotal);
    if (st.changed) changed = true;
    return { ...section, subtotal: st.value, items };
  });
  const t = clean(s.total);
  if (t.changed) changed = true;

  return changed ? { ...s, total: t.value, sections } : null;
}

async function main() {
  const entries = await prisma.ratingEntry.findMany({
    select: {
      id: true,
      section1Score: true,
      section2Score: true,
      section3Score: true,
      section4Score: true,
      section5Score: true,
      totalScore: true,
      snapshot: true,
    },
  });

  let columnsFixed = 0;
  let snapshotsFixed = 0;

  for (const e of entries) {
    const cols = {
      section1Score: round2(e.section1Score),
      section2Score: round2(e.section2Score),
      section3Score: round2(e.section3Score),
      section4Score: round2(e.section4Score),
      section5Score: round2(e.section5Score),
      totalScore: round2(e.totalScore),
    };
    const columnsChanged =
      cols.section1Score !== e.section1Score ||
      cols.section2Score !== e.section2Score ||
      cols.section3Score !== e.section3Score ||
      cols.section4Score !== e.section4Score ||
      cols.section5Score !== e.section5Score ||
      cols.totalScore !== e.totalScore;

    const fixedSnapshot = cleanSnapshot(e.snapshot);

    if (!columnsChanged && !fixedSnapshot) continue;

    await prisma.ratingEntry.update({
      where: { id: e.id },
      data: {
        ...(columnsChanged ? cols : {}),
        ...(fixedSnapshot ? { snapshot: fixedSnapshot as unknown as Prisma.InputJsonValue } : {}),
      },
    });

    if (columnsChanged) columnsFixed++;
    if (fixedSnapshot) snapshotsFixed++;
  }

  console.log(
    `Готово. Перевірено записів: ${entries.length}. ` +
      `Виправлено колонок: ${columnsFixed}, знімків: ${snapshotsFixed}.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
