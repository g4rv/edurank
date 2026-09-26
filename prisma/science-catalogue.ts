import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import { SCIENCE_TEMPLATE_2027 } from '../lib/science/work-types-2027';
import { stakeYearOf } from '../lib/science/academic-year';
import { scienceWorkTypeRows } from './catalogue';

// How PRODUCTION gets the Додаток III catalogue — the 2026/2027 навчальний рік
// and its види роботи (owner, 2026-09-24).
//
// Why a script and not `pnpm db:seed`: production is never seeded again. The
// seed also upserts the RATING catalogue with `update: data`, which would undo
// every indicator an admin has edited in /admin/rating. This touches only the
// two science catalogue tables.
//
// CREATE-ONLY. A row that already exists is never updated and never deleted —
// an ADMIN may have reworded a label, changed a rule or deactivated a вид
// роботи on /admin/science-plan/[id], and a second run must not undo that. A
// second run on a complete catalogue changes nothing.
//
//   pnpm db:science-catalogue            reports
//   pnpm db:science-catalogue --apply    writes

const apply = process.argv.includes('--apply');

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function main() {
  const { academicYear, orderRef, minHoursPerRate } = SCIENCE_TEMPLATE_2027;
  const rows = scienceWorkTypeRows();

  const template = await prisma.sciencePlanTemplate.findUnique({
    where: { academicYear },
    select: { id: true, status: true, workTypes: { select: { code: true } } },
  });
  const existing = new Set(template?.workTypes.map((t) => t.code) ?? []);
  const missing = rows.filter((r) => !existing.has(r.code));

  console.log(
    template
      ? `Навчальний рік ${academicYear}: вже є (${template.status}), видів роботи: ${existing.size}.`
      : `Навчальний рік ${academicYear}: немає — буде створено.`
  );
  for (const row of missing) {
    console.log(`  + ${row.shape.itemNumber} · ${row.code} — ${row.shape.label}`);
  }

  // Read-only: who oversees наукова робота. The migration switches it on for
  // the відділ whose registryKey is NNV; if nobody is listed, set it on the
  // відділ's edit page — nobody but ADMIN can decline a record until then.
  const overseers = await prisma.division.findMany({
    where: { canOverseeScience: true },
    select: { name: true, registryKey: true },
  });
  console.log(
    overseers.length > 0
      ? `«Перевірка науки»: ${overseers.map((d) => `${d.name} (${d.registryKey ?? '—'})`).join(', ')}.`
      : '«Перевірка науки»: жоден відділ — увімкніть її ННВ на сторінці редагування відділу.'
  );

  if (template && missing.length === 0) {
    console.log('\nНічого створювати: каталог повний.');
    return;
  }
  if (!apply) {
    console.log(
      `\nБуде створено: ${template ? '' : 'навчальний рік + '}${missing.length} видів роботи. Запустіть з --apply, щоб записати.`
    );
    return;
  }

  await prisma.$transaction(async (tx) => {
    const templateId =
      template?.id ??
      (
        await tx.sciencePlanTemplate.create({
          data: {
            academicYear,
            orderRef,
            minHoursPerRate,
            stakeYear: stakeYearOf(academicYear),
            status: 'OPEN',
          },
          select: { id: true },
        })
      ).id;

    for (const row of missing) {
      await tx.scienceWorkType.create({
        data: { ...row.shape, templateId, code: row.code },
      });
    }
  });

  console.log(`\nГотово. Створено видів роботи: ${missing.length}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
