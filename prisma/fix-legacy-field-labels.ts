import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import type { Prisma } from '../lib/generated/prisma/client';

// Give the 2025 template's numeric fields the name of the thing they measure.
//
//   pnpm db:fix-field-labels          — show what would change
//   pnpm db:fix-field-labels --apply  — write it
//   pnpm db:fix-field-labels --undo   — put the criteria text back
//
// ── THE PROBLEM ─────────────────────────────────────────────────────────────
//
// `import-template-2025.ts` built the template from the university's sheet.
// A MULT indicator needs a number to multiply, so it created one — and the only
// text it had to label the field with was the sheet's «Критерії» column. So
// eleven indicators carry a field whose label is a SCORING CONDITION rather
// than the name of anything:
//
//   5.1  «за умови заповнення усіх обов'язкових пунктів»  ← the criterion
//   3.29 «за 1 патент»
//   3.7  «балів* др.а./с.а.»
//   1.1  «бал за рік»
//
// On the rating tab that is merely odd. In the Характеристика it is wrong: the
// document printed «за умови заповнення усіх обов'язкових пунктів: 0.65» as
// evidence of a Moodle course, which says nothing about the record and quotes a
// rating multiplier at whoever reads the licence (owner, 2026-08-31).
//
// ── THE FIX ─────────────────────────────────────────────────────────────────
//
// The label becomes the indicator's own — «Навчально-методичне забезпечення
// навчальних дисциплін (освітніх компонентів) на платформі Moodle». That name
// already exists and is already correct; nothing is invented.
//
// ── WHY THE FIELD IS NOT SIMPLY REMOVED ─────────────────────────────────────
//
// Because MULT multiplies by it. `specProblems()` treats a field set and its
// scoring rule as a contract, and a MULT indicator with no number to read
// breaks it. Only the label changes here; the field, its name and every stored
// value stay exactly as they are.
//
// Scores cannot move either way: `Activity.score` is frozen at save and
// `recompute.ts` only sums it.

const apply = process.argv.includes('--apply');
const undo = process.argv.includes('--undo');
const YEAR = 2025;

const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL!) });

interface Field {
  kind: string;
  name: string;
  label: string;
  [key: string]: unknown;
}

/** «Видання затверджені вченою радою університету:» → without the trailing colon */
const clean = (label: string) => label.trim().replace(/\s*:\s*$/, '');

async function main() {
  const template = await prisma.ratingTemplate.findFirst({
    where: { year: YEAR },
    select: { id: true, status: true },
  });
  if (!template) throw new Error(`немає шаблону ${YEAR}`);

  const types = await prisma.activityType.findMany({
    where: { templateId: template.id },
    select: {
      id: true,
      itemNumber: true,
      label: true,
      coefficientNote: true,
      evidenceFields: true,
    },
    orderBy: { itemNumber: 'asc' },
  });

  let changed = 0;
  for (const type of types) {
    const fields = (type.evidenceFields ?? []) as unknown as Field[];
    if (!Array.isArray(fields)) continue;

    const note = type.coefficientNote?.trim() ?? '';
    const own = clean(type.label);

    // Matched on the criteria text, not on the field name: `value` and `credits`
    // are both used, and a field somebody has already renamed by hand must not
    // be touched a second time.
    const target = undo ? own : note;
    const replacement = undo ? note : own;
    if (!target || !replacement) continue;

    const next = fields.map((f) =>
      f.kind === 'number' && f.label === target ? { ...f, label: replacement } : f
    );
    if (JSON.stringify(next) === JSON.stringify(fields)) continue;

    changed++;
    const field = fields.find((f) => f.kind === 'number' && f.label === target);
    console.log(`${type.itemNumber.padEnd(6)} «${field?.name}»`);
    console.log(`       ${target.slice(0, 70)}`);
    console.log(`    →  ${replacement.slice(0, 70)}`);

    if (apply || undo) {
      await prisma.activityType.update({
        where: { id: type.id },
        data: { evidenceFields: next as unknown as Prisma.InputJsonValue },
      });
    }
  }

  const verb = undo ? 'ПОВЕРНУТО' : apply ? 'ЗАПИСАНО' : 'БУДЕ ЗАПИСАНО';
  console.log(`\n${verb}: ${changed} показників`);
  if (!apply && !undo) console.log('\nЩоб застосувати: pnpm db:fix-field-labels --apply');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
