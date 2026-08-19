import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import { ceilToStep, floorToStep, formatStake } from '../lib/stake/units';

// One-off repair for Мін/Макс written before the schema snapped them to the
// 0,05 ladder (2026-08-19, commit b5b4736).
//
// WHY IT MATTERS. A Максимум of 0,93 is a ceiling no legal ставка can reach —
// every value must be a multiple of 0,05 — and `formulaShares` caps the share
// at exactly 0,93, so the формула proposes a number `saveDistribution` then
// refuses on the step check. The кафедра gets a row nobody can save, and since
// only ADMIN edits caps, the завідувач looking at it cannot clear it either.
//
// Rounded in the direction that keeps a bound a bound, the same as the schema:
// Мінімум UP so nobody lands below what was intended, Максимум DOWN so nobody
// lands above it. A pair that collapses (min above max after snapping) is left
// alone and reported — that is a judgement about one person's ставка, not a
// rounding, and it belongs to whoever set it.
//
//   pnpm db:fix-stake-ladder          list what would change, write nothing
//   pnpm db:fix-stake-ladder --apply  write it
//
// Safe to run twice: a value already on the ladder is not touched.

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

const STEP = 5;
const onLadder = (n: number) => n % STEP === 0;

async function main() {
  const apply = process.argv.includes('--apply');

  const rows = await prisma.staffStakeLimits.findMany({
    select: {
      id: true,
      year: true,
      minHundredths: true,
      maxHundredths: true,
      staff: {
        select: { lastName: true, firstName: true, department: { select: { name: true } } },
      },
    },
    orderBy: [{ year: 'asc' }],
  });

  const offLadder = rows.filter((r) => !onLadder(r.minHundredths) || !onLadder(r.maxHundredths));

  console.log(`StaffStakeLimits rows: ${rows.length}`);
  if (offLadder.length === 0) {
    console.log('Every Мін/Макс already sits on the 0,05 ladder. Nothing to do.');
    return;
  }

  console.log(`Off the ladder: ${offLadder.length}\n`);

  let fixed = 0;
  const collapsed: string[] = [];

  for (const row of offLadder) {
    const who = `${row.staff.lastName} ${row.staff.firstName}`;
    const where = row.staff.department?.name ?? 'без кафедри';
    const min = ceilToStep(row.minHundredths);
    const max = floorToStep(row.maxHundredths);

    if (max < min) {
      collapsed.push(
        `  ${row.year}  ${who} (${where}): ` +
          `${formatStake(row.minHundredths)}–${formatStake(row.maxHundredths)} ` +
          `→ would collapse to ${formatStake(min)}–${formatStake(max)}, left alone`
      );
      continue;
    }

    console.log(
      `  ${row.year}  ${who} (${where}): ` +
        `${formatStake(row.minHundredths)}–${formatStake(row.maxHundredths)} → ` +
        `${formatStake(min)}–${formatStake(max)}`
    );

    if (apply) {
      await prisma.staffStakeLimits.update({
        where: { id: row.id },
        data: { minHundredths: min, maxHundredths: max },
      });
    }
    fixed += 1;
  }

  if (collapsed.length > 0) {
    console.log(`\nNeeds a person, not a script — the band is narrower than one step:`);
    for (const line of collapsed) console.log(line);
  }

  console.log(
    apply
      ? `\nWritten: ${fixed}.`
      : `\nWould change ${fixed}. Nothing written — re-run with --apply.`
  );
  if (apply && fixed > 0) {
    console.log('The кафедри involved will re-settle their split the next time a cap is edited.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
