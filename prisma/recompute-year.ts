import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import { recomputeRatingEntries } from '../lib/rating/recompute';

// Rebuilds the RatingEntry rollup for one year from its activities.
//
//   pnpm db:recompute 2025
//
// The app keeps the rollup in step by recomputing inside the same transaction
// as every submit, discard and division entry. An IMPORT writes activities
// straight in, so nothing ever ran — and /rating, /stakes and the формула all
// read RatingEntry, never the activities. 7060 imported rows with no rollup
// look exactly like an empty year.

async function main() {
  const year = Number(process.argv[2]);
  if (!Number.isInteger(year)) throw new Error('usage: pnpm db:recompute <year>');

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });
  try {
    const holders = await prisma.activity.findMany({
      where: { year },
      select: { staffId: true },
      distinct: ['staffId'],
    });
    console.log(`${year}: ${holders.length} people hold activities`);
    if (holders.length === 0) return;

    await prisma.$transaction(
      async (tx) => {
        await recomputeRatingEntries(
          tx,
          holders.map((h) => h.staffId),
          year
        );
      },
      { timeout: 300_000 }
    );

    const entries = await prisma.ratingEntry.findMany({
      where: { year },
      select: { totalScore: true },
      orderBy: { totalScore: 'desc' },
    });
    const sum = entries.reduce((s, e) => s + e.totalScore, 0);
    console.log(`RatingEntry rows: ${entries.length}`);
    console.log(`highest: ${entries[0]?.totalScore} · lowest: ${entries.at(-1)?.totalScore}`);
    console.log(`sum of all totals: ${Math.round(sum)}`);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
