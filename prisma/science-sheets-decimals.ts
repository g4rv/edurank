import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import type { Prisma } from '../lib/generated/prisma/client';
import { hasTooManyDecimals } from '../lib/decimal-input';

// «Кількість друкованих аркушів» takes ONE decimal at most — «1,7», never
// «1,73» (owner, 2026-10-16). The rule is `decimals: 1` on the number field.
//
//   pnpm db:science-sheets-decimals            — report only, writes nothing
//   pnpm db:science-sheets-decimals --apply    — write it, in one transaction
//
// Why a script: a вид роботи's form is JSON in `ScienceWorkType.evidenceFields`,
// so editing the catalogue in `lib/science/` changes nothing already saved, a
// cloned planning year is never reseeded, and production is never seeded again.
//
// Narrow on purpose: it finds the number fields NAMED `credits` or `value` and
// LABELLED «Кількість друкованих аркушів», in EVERY year, and adds only the one
// key. No other field, label or rule moves, and no hours are recalculated.
//
// Works already saved are only REPORTED. A sheet count with two decimals stays
// as it is (the form does not re-judge a saved value), and the list names whose
// it is so a person can look at it. A script that rounded it would change the
// hours they were already credited.

const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL!) });
const apply = process.argv.includes('--apply');

const SHEETS_LABEL = 'Кількість друкованих аркушів';
type Field = {
  kind?: string;
  name?: string;
  label?: string;
  decimals?: number;
  [k: string]: unknown;
};

const isSheets = (f: Field) =>
  f.kind === 'number' && (f.name === 'credits' || f.name === 'value') && f.label === SHEETS_LABEL;

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
  const sheetTypeIds = new Set<string>();

  for (const t of types) {
    const fields = t.evidenceFields as unknown as Field[] | null;
    if (!Array.isArray(fields)) continue;
    const target = fields.find(isSheets);
    if (!target) continue;
    sheetTypeIds.add(t.id);
    if (target.decimals === 1) continue;
    console.log(
      `  + ${t.template.academicYear} (${t.template.status}) ${t.code}: «${target.name}»` +
        `  було: ${target.decimals === undefined ? 'без обмеження' : `${target.decimals} зн.`}  →  стало: 1 знак`
    );
    updates.push({
      id: t.id,
      fields: fields.map((f) => (isSheets(f) ? { ...f, decimals: 1 } : f)),
    });
  }

  // Saved works that already carry a longer number — reported, never changed.
  const works = await prisma.scienceWork.findMany({
    where: { workTypeId: { in: [...sheetTypeIds] } },
    select: {
      id: true,
      evidence: true,
      workType: { select: { code: true } },
      template: { select: { academicYear: true } },
    },
  });
  const long: string[] = [];
  for (const w of works) {
    const e = w.evidence as Record<string, unknown> | null;
    for (const key of ['credits', 'value']) {
      const n = Number(e?.[key]);
      if (e?.[key] !== undefined && hasTooManyDecimals(n, 1)) {
        long.push(
          `  ! ${w.template.academicYear} ${w.workType.code}: аркушів ${String(e?.[key])} (робота ${w.id})`
        );
      }
    }
  }

  console.log(
    `\nВидів роботи з аркушами: ${sheetTypeIds.size}; потребують змін: ${updates.length}` +
      `${apply ? '' : ' (нічого не записано)'}`
  );
  if (long.length > 0) {
    console.log(`\nЗбережені роботи з двома знаками після коми — НЕ змінюються (${long.length}):`);
    for (const l of long) console.log(l);
  } else {
    console.log('Збережених робіт із двома знаками після коми немає.');
  }

  if (!apply) {
    if (updates.length > 0) console.log('\nЗапустіть з --apply, щоб записати.');
    return;
  }
  if (updates.length === 0) {
    console.log('\nНічого змінювати.');
    return;
  }
  await prisma.$transaction(async (tx) => {
    for (const u of updates) {
      await tx.scienceWorkType.update({
        where: { id: u.id },
        data: { evidenceFields: u.fields as unknown as Prisma.InputJsonValue },
      });
    }
  });
  console.log(`\nЗаписано: ${updates.length}. Повторний запуск нічого не знайде.`);
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
