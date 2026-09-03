import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import { normaliseStudentName } from '../lib/stake/claims';
import type { Funding, StudentDegree, StudyForm } from '../lib/stake/norms';

// Loads the реєстр зарахованих into AdmittedStudent.
//
//   pnpm db:import-students                  — report only, writes nothing
//   pnpm db:import-students --apply          — write the missing rows
//   pnpm db:import-students --year 2027      — another campaign's file
//
// NOT a seed. `pnpm db:seed` upserts the 2026 catalogue and production is never
// seeded again now that it is populated by admin edits — but production still
// needs these 1046 rows, and this touches one table.
//
// It is also the only import path that works there. edu-reference/ is not on
// the server and neither is staff-roster.json, which is why the Характеристика
// backfill needed its own script too — but accepted-2026.json IS in git, so
// this runs unchanged wherever the code is.
//
// Adds only. A row already in the database is skipped and counted, never
// updated and never deleted: the same rule the /admin/students importer will
// follow, and for the same reason — one file is one наказ, not the whole truth.

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

/** One row of `lib/students/accepted-<year>.json`. `faculty` is present and ignored. */
export interface SourceStudent {
  name: string;
  speciality: string;
  degree: StudentDegree;
  form: StudyForm;
  funding: Funding;
}

export interface PlannedRow {
  year: number;
  name: string;
  nameNormalised: string;
  specialityId: string;
  degree: StudentDegree;
  form: StudyForm;
  funding: Funding;
}

export interface ImportPlan {
  create: PlannedRow[];
  skipped: SourceStudent[];
  problems: string[];
}

/**
 * The model's @@unique, as a string.
 *
 * Ступінь is deliberately absent — it follows from the programme, and the
 * database key does not carry it either. The two must agree, or this would plan
 * a row the database then rejects.
 */
export function importKey(
  year: number,
  student: Pick<SourceStudent, 'name' | 'speciality' | 'form' | 'funding'>
): string {
  return [
    year,
    normaliseStudentName(student.name),
    student.speciality,
    student.form,
    student.funding,
  ].join('|');
}

/**
 * What the run would do. Pure, so the rules are testable without a database.
 *
 * `existing` holds `importKey`s already in the database. Duplicates WITHIN the
 * file are skipped too — a наказ transcribed twice is the likeliest way one
 * arrives, and it is not an error worth stopping the whole import for.
 */
export function planImport(
  year: number,
  source: readonly SourceStudent[],
  specialityIds: ReadonlyMap<string, string>,
  existing: ReadonlySet<string>
): ImportPlan {
  const plan: ImportPlan = { create: [], skipped: [], problems: [] };
  const seen = new Set(existing);

  for (const student of source) {
    const specialityId = specialityIds.get(student.speciality);
    if (!specialityId) {
      plan.problems.push(`${student.name}: спеціальності «${student.speciality}» немає в базі`);
      continue;
    }

    const key = importKey(year, student);
    if (seen.has(key)) {
      plan.skipped.push(student);
      continue;
    }
    seen.add(key);

    plan.create.push({
      year,
      name: student.name,
      nameNormalised: normaliseStudentName(student.name),
      specialityId,
      degree: student.degree,
      form: student.form,
      funding: student.funding,
    });
  }

  return plan;
}

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main() {
  const apply = process.argv.includes('--apply');
  const yearArg = argValue('--year') ?? '2026';
  const year = Number(yearArg);
  if (!Number.isInteger(year)) throw new Error(`Не рік: «${yearArg}»`);

  const file = resolve(`lib/students/accepted-${year}.json`);
  const source = JSON.parse(readFileSync(file, 'utf8')) as SourceStudent[];
  console.log(`${file}: ${source.length} рядків\n`);

  const [specialities, existingRows] = await Promise.all([
    prisma.speciality.findMany({ select: { id: true, name: true } }),
    prisma.admittedStudent.findMany({
      where: { year },
      select: {
        nameNormalised: true,
        form: true,
        funding: true,
        speciality: { select: { name: true } },
      },
    }),
  ]);

  const specialityIds = new Map(specialities.map((s) => [s.name, s.id]));
  // Built the same way importKey does, but from a row that is already
  // normalised — so it must NOT be normalised twice.
  const existing = new Set(
    existingRows.map((r) =>
      [year, r.nameNormalised, r.speciality.name, r.form, r.funding].join('|')
    )
  );

  const plan = planImport(year, source, specialityIds, existing);

  console.log(`  Додати        ${plan.create.length}`);
  console.log(`  Вже в списку  ${plan.skipped.length}`);
  console.log(`  Помилки       ${plan.problems.length}\n`);

  if (plan.problems.length > 0) {
    // Refuses a partial import, the same as scripts/build-accepted-students.ts:
    // the alternative is a register that silently lost the students nobody can
    // then claim.
    console.error('Імпорт скасовано — ці рядки прочитати не вдалося:\n');
    for (const problem of plan.problems) console.error(`  ${problem}`);
    process.exit(1);
  }

  if (!apply) {
    console.log('Це лише звіт. Запустіть з --apply, щоб записати.');
    return;
  }

  if (plan.create.length === 0) {
    console.log('Нічого додавати.');
    return;
  }

  await prisma.admittedStudent.createMany({ data: plan.create });
  const total = await prisma.admittedStudent.count({ where: { year } });
  console.log(`Додано ${plan.create.length}. Усього за ${year}: ${total}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
