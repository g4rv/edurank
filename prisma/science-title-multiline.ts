import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import type { Prisma } from '../lib/generated/prisma/client';

// «Назва роботи» is a TEXTAREA (owner, 2026-11-13): people paste the whole
// bibliographic description there, and a one-line box hid most of it.
//
//   pnpm db:science-title-multiline            — report only, writes nothing
//   pnpm db:science-title-multiline --apply    — write it, in one transaction
//
// Why a script: a вид роботи's form is JSON in `ScienceWorkType.evidenceFields`,
// so editing the catalogue in `lib/science/` changes nothing already saved, a
// cloned planning year is never reseeded, and production is never seeded again.
//
// Narrow on purpose: the text field NAMED `title`, in EVERY year, gets
// `multiline: true`. No label, rule, order or other field moves, and no work
// already saved is touched.

const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL!) });
const apply = process.argv.includes('--apply');

type Field = { kind?: string; name?: string; multiline?: boolean; [k: string]: unknown };
const isTitle = (f: Field) => f.kind === 'text' && f.name === 'title';

async function main() {
  const types = await prisma.scienceWorkType.findMany({
    select: {
      id: true,
      code: true,
      evidenceFields: true,
      template: { select: { academicYear: true, status: true } },
    },
    orderBy: [{ template: { academicYear: 'asc' } }, { code: 'asc' }],
  });

  const updates: { id: string; fields: Field[] }[] = [];
  let withTitle = 0;
  for (const t of types) {
    const fields = t.evidenceFields as unknown as Field[] | null;
    if (!Array.isArray(fields)) continue;
    const target = fields.find(isTitle);
    if (!target) continue;
    withTitle++;
    if (target.multiline === true) continue;
    console.log(`  + ${t.template.academicYear} (${t.template.status}) ${t.code}`);
    updates.push({
      id: t.id,
      fields: fields.map((f) => (isTitle(f) ? { ...f, multiline: true } : f)),
    });
  }

  console.log(`\nВидів роботи з назвою: ${withTitle}; потребують змін: ${updates.length}`);
  if (!apply) {
    console.log('Нічого не записано. Запустіть з --apply, щоб записати.');
    return;
  }
  await prisma.$transaction(
    updates.map((u) =>
      prisma.scienceWorkType.update({
        where: { id: u.id },
        data: { evidenceFields: u.fields as unknown as Prisma.InputJsonValue },
      })
    )
  );
  console.log(`Записано: ${updates.length}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
