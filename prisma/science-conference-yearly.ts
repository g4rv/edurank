import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';

// One-time correction: «Участь у конференціях» gets a PER-YEAR dedup key.
//
// The наказ caps the item at five per навчальний рік («мах.5»), and a cap that
// restarts every year only makes sense if the counting does. `reuse: ONCE`
// puts no year into `workKey`, so an annual конференція attended in 2026/2027
// could never be attended again in any later year — the person would be told
// the work already exists and would score nothing (owner, 2026-09-17 — D25).
//
// Why a script and not the seed: `pnpm db:seed` upserts the 2026/2027 template
// alone, production is never seeded again, and a template CLONED from it copies
// the JSON and is never reseeded at all. This reaches every template there is.
//
//   pnpm db:science-conference-yearly            reports
//   pnpm db:science-conference-yearly --apply    writes

const apply = process.argv.includes('--apply');

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function main() {
  // Matched on `code`, which is the stable semantic key — `label` is editable
  // on /admin/science-plan/[id] and an admin may have reworded it.
  const stale = await prisma.scienceWorkType.findMany({
    where: { code: 'conference_attendance', reuse: 'ONCE' },
    select: { id: true, template: { select: { academicYear: true } } },
    orderBy: { template: { academicYear: 'asc' } },
  });

  if (stale.length === 0) {
    console.log('Нічого змінювати: жоден рядок «Участь у конференціях» не має reuse=ONCE.');
    return;
  }

  for (const row of stale) {
    console.log(`  ${row.template.academicYear} · conference_attendance — ONCE → YEARLY`);
  }

  if (!apply) {
    console.log(`\nЗнайдено рядків: ${stale.length}. Запустіть з --apply, щоб записати.`);
    return;
  }

  const result = await prisma.scienceWorkType.updateMany({
    where: { id: { in: stale.map((r) => r.id) } },
    data: { reuse: 'YEARLY' },
  });

  console.log(`\nГотово. Оновлено рядків: ${result.count}.`);
  // Stage 1 stores no work keys, so there is nothing to rebuild. Said out loud
  // because the obvious next question, once Stage 2 exists, is whether old
  // records need re-keying — and after Stage 2 they will.
  console.log('Записів наукової роботи ще немає — перераховувати ключі не потрібно.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
