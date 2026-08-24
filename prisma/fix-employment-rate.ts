import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import { formatStake, fromHundredths } from '../lib/stake/units';

// One-off repair for `Staff.employmentRate` on people whose ставка was settled
// BEFORE the head's number started landing on the profile (commit d0f92e8,
// 2026-08-21 22:27).
//
// WHY THEY ARE WRONG. `saveDistribution` writes `employmentRate` in the same
// transaction as the allocations, but the кафедри spread on 2026-08-21 21:39
// were saved forty-five minutes before that code existed. Nothing wiped the
// column — the audit log has no entry that ever touched it — it was simply
// never written. The profile then showed «Ставка: —» next to «Розподілено:
// Кафедра … — 0,50», which is one thing reported two ways.
//
// WHAT IT WRITES. The sum of every `StakeAllocation` this person holds in the
// ACTIVE year, across every кафедра that pays them — the same figure
// `saveDistribution` computes. A сумісник on 0,90 + 0,25 gets 1,15.
//
// Nobody is zeroed. A person with no allocation at all is left exactly as they
// are: the column may hold a rate somebody typed by hand before the create form
// was the only place to type one, and that is not this script's to discard.
//
//   pnpm db:fix-employment-rate          list what would change, write nothing
//   pnpm db:fix-employment-rate --apply  write it
//
// Safe to run twice: a row that already matches its allocations is not touched.

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function main() {
  const apply = process.argv.includes('--apply');

  const template = await prisma.ratingTemplate.findFirst({
    where: { isActive: true },
    select: { year: true },
  });
  if (!template) {
    console.error('Немає активного шаблону рейтингу — рік ставок невідомий. Нічого не зроблено.');
    process.exitCode = 1;
    return;
  }

  const allocations = await prisma.stakeAllocation.findMany({
    where: { distribution: { year: template.year } },
    select: {
      staffId: true,
      proposedHundredths: true,
      staff: { select: { lastName: true, firstName: true, employmentRate: true } },
    },
  });

  // Summed per person across кафедри — the сумісник case is the whole reason
  // this is a sum and not a copy.
  const totals = new Map<string, { hundredths: number; name: string; current: number | null }>();
  for (const a of allocations) {
    const entry = totals.get(a.staffId) ?? {
      hundredths: 0,
      name: `${a.staff.lastName} ${a.staff.firstName}`,
      current: a.staff.employmentRate,
    };
    entry.hundredths += a.proposedHundredths;
    totals.set(a.staffId, entry);
  }

  const changes = [...totals.entries()]
    .map(([staffId, e]) => ({ staffId, ...e, next: fromHundredths(e.hundredths) }))
    .filter((c) => c.current !== c.next);

  console.log(`Рік ${template.year}: ${totals.size} осіб із розподіленою ставкою.`);
  if (changes.length === 0) {
    console.log('Усі значення вже збігаються з розподілом. Нічого змінювати.');
    return;
  }

  for (const c of changes) {
    const from = c.current === null ? '—' : c.current.toFixed(2).replace('.', ',');
    console.log(`  ${c.name}: ${from} → ${formatStake(c.hundredths)}`);
  }

  if (!apply) {
    console.log(`\n${changes.length} записів буде змінено. Запустіть з --apply, щоб записати.`);
    return;
  }

  for (const c of changes) {
    await prisma.staff.update({ where: { id: c.staffId }, data: { employmentRate: c.next } });
  }
  console.log(`\nЗаписано: ${changes.length}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
