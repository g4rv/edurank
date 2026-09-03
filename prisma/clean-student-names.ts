import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import { normaliseStudentName } from '../lib/stake/claims';
import { cleanName } from '../lib/students/import';

// Takes the birth dates out of the ПІБ of rows already in AdmittedStudent.
//
//   pnpm db:clean-student-names            — report only, writes nothing
//   pnpm db:clean-student-names --apply    — rewrite the names
//
// The first real import put 781 of them there: the деканат copied the ЄДЕБО
// «Вступник» column, which is «Прізвище Ім'я По батькові 16.05.1985». The
// importer strips that now — see cleanName — and this catches up the rows that
// went in before it did.
//
// Three reasons it matters, the third worst:
//   1. a birth date is personal data the register was designed never to hold;
//   2. it reads wrong on every screen the ПІБ appears on;
//   3. the SAME student in a later, clean file has a different nameNormalised,
//      so they import again as a second row and a third of the register
//      silently doubles.
//
// It refuses to touch a row whose cleaned name would COLLIDE with another row,
// and it refuses to run at all while a StudentClaim points at a name it would
// rewrite — a claim is matched on the normalised ПІБ, so changing one under a
// claim would quietly unhook a bonus from its student.

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function main() {
  const apply = process.argv.includes('--apply');

  const rows = await prisma.admittedStudent.findMany({
    select: {
      id: true,
      year: true,
      name: true,
      nameNormalised: true,
      specialityId: true,
      form: true,
      funding: true,
    },
  });

  const dirty = rows
    .map((row) => ({ row, name: cleanName(row.name) }))
    .filter(({ row, name }) => name !== row.name);

  console.log(`Усього рядків: ${rows.length}`);
  console.log(`Потребують очищення: ${dirty.length}\n`);

  if (dirty.length === 0) {
    console.log('Нічого робити.');
    return;
  }

  for (const { row, name } of dirty.slice(0, 5)) {
    console.log(`  «${row.name}»\n    → «${name}»`);
  }
  if (dirty.length > 5) console.log(`  …і ще ${dirty.length - 5}\n`);

  const empty = dirty.filter(({ name }) => name.length < 3);
  if (empty.length > 0) {
    console.error(`\nЗУПИНЕНО: ${empty.length} рядків не залишають імені після очищення:`);
    for (const { row } of empty.slice(0, 10)) console.error(`  «${row.name}»`);
    process.exit(1);
  }

  // The unique key is (year, nameNormalised, specialityId, form, funding). Two
  // rows can only collide after cleaning, never before.
  const taken = new Set(
    rows.map((r) => [r.year, r.nameNormalised, r.specialityId, r.form, r.funding].join('|'))
  );
  const clashes: typeof dirty = [];
  for (const item of dirty) {
    const { row, name } = item;
    const key = [
      row.year,
      normaliseStudentName(name),
      row.specialityId,
      row.form,
      row.funding,
    ].join('|');
    if (taken.has(key)) clashes.push(item);
    else taken.add(key);
  }
  if (clashes.length > 0) {
    console.error(`\nЗУПИНЕНО: ${clashes.length} рядків після очищення збігаються з наявними:`);
    for (const { row, name } of clashes.slice(0, 10)) console.error(`  «${row.name}» → «${name}»`);
    console.error('Спочатку розберіться з дублікатами вручну.');
    process.exit(1);
  }

  // A claim is found by the normalised ПІБ, so rewriting a name a claim points
  // at would leave the claim naming nobody.
  const claimed = await prisma.studentClaim.findMany({
    where: { studentNameNormalised: { in: dirty.map(({ row }) => row.nameNormalised) } },
    select: { studentName: true, staff: { select: { lastName: true } } },
  });
  if (claimed.length > 0) {
    console.error(`\nЗУПИНЕНО: ${claimed.length} заявок НПП вказують на імена, які треба змінити:`);
    for (const c of claimed.slice(0, 10))
      console.error(`  «${c.studentName}» — ${c.staff.lastName}`);
    process.exit(1);
  }

  if (!apply) {
    console.log('\nЦе лише звіт. Запустіть з --apply, щоб записати.');
    return;
  }

  for (const { row, name } of dirty) {
    await prisma.admittedStudent.update({
      where: { id: row.id },
      data: { name, nameNormalised: normaliseStudentName(name) },
    });
  }
  console.log(`\nОчищено ${dirty.length} рядків.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
