import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '../lib/generated/prisma/client';
import { evidenceFieldsSpecSchema } from '../validations/activity-type-spec';

// One-off (owner, 2026-11-19): rating 5.1's «Дисципліна» box learns to become a
// select over the person's assigned disciplines (`fromDisciplines`). The form
// definition is JSON in the database, so the catalogue alone reaches nothing:
// `pnpm db:seed` upserts the current template only, and production is never
// seeded again.
//
//   pnpm db:discipline-pick           — report: which years and indicators
//   pnpm db:discipline-pick --apply   — write
//
// Every year, closed ones included (a closed year renders from its snapshot and
// is not affected; a reopened one needs the marker). The box is found by being a
// text field NAMED `discipline` on an indicator that gates the rating — no code
// is matched. Nothing else in the spec moves; a person with no assigned list
// still sees the old text box. Safe to run twice.

const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL!) });

async function main() {
  const apply = process.argv.includes('--apply');
  const types = await prisma.activityType.findMany({
    where: { gatesRating: true },
    select: {
      id: true,
      itemNumber: true,
      evidenceFields: true,
      template: { select: { year: true } },
    },
    orderBy: [{ template: { year: 'asc' } }, { itemNumber: 'asc' }],
  });

  let changed = 0;
  for (const t of types) {
    const parsed = evidenceFieldsSpecSchema.safeParse(t.evidenceFields);
    if (!parsed.success) {
      console.log(`${t.template.year} п.${t.itemNumber}: специфікація не читається — пропущено`);
      continue;
    }
    const fields = parsed.data;
    const at = fields.findIndex((f) => f.kind === 'text' && f.name === 'discipline');
    if (at < 0) {
      console.log(`${t.template.year} п.${t.itemNumber}: немає поля «discipline» — пропущено`);
      continue;
    }
    const f = fields[at];
    if (f.kind === 'text' && f.fromDisciplines) {
      console.log(`${t.template.year} п.${t.itemNumber}: уже позначено`);
      continue;
    }
    changed++;
    console.log(`${t.template.year} п.${t.itemNumber}: буде позначено`);
    if (apply) {
      const next = fields.map((x, i) => (i === at ? { ...x, fromDisciplines: true as const } : x));
      await prisma.activityType.update({
        where: { id: t.id },
        data: { evidenceFields: next as unknown as Prisma.InputJsonValue },
      });
    }
  }
  console.log(
    apply
      ? `\nЗаписано: ${changed}.`
      : `\nУ базі нічого не змінено (${changed} до зміни). Запустіть з --apply.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
