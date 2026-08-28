import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import { SPECIALITY_DEPARTMENTS, normaliseDepartmentName } from '../lib/specialities/departments';

// Fills `SpecialityDepartment` from the constant that used to be the довідник.
//
//   pnpm db:link-speciality-departments          list what would be written
//   pnpm db:link-speciality-departments --apply  write it
//
// This is the ONE place a кафедра is matched by name, and it exists to stop that
// happening ever again: it turns 30 names into 30 ids, once. Run it BEFORE the
// 2026 reorganisation renames anything — after the rename there is nothing left
// to match against and the links have to be typed in by hand on
// /admin/stakes/norms.
//
// Adds only. It never deletes a link somebody made in the app, so a re-run after
// hand-editing cannot undo their work.
//
// Safe to run twice: the second run finds every pair already present.

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function main() {
  const apply = process.argv.includes('--apply');

  const [specialities, departments, existing] = await Promise.all([
    prisma.speciality.findMany({ select: { id: true, name: true } }),
    prisma.department.findMany({ select: { id: true, name: true } }),
    prisma.specialityDepartment.findMany({
      select: { specialityId: true, departmentId: true },
    }),
  ]);

  const specialityByName = new Map(specialities.map((s) => [s.name, s.id]));
  const departmentByName = new Map(departments.map((d) => [normaliseDepartmentName(d.name), d.id]));
  const already = new Set(existing.map((e) => `${e.specialityId}|${e.departmentId}`));

  const planned: { specialityId: string; departmentId: string; label: string }[] = [];
  const missingSpeciality: string[] = [];
  const missingDepartment: string[] = [];

  for (const [speciality, names] of Object.entries(SPECIALITY_DEPARTMENTS)) {
    const specialityId = specialityByName.get(speciality);
    if (!specialityId) {
      missingSpeciality.push(speciality);
      continue;
    }
    for (const name of names) {
      const departmentId = departmentByName.get(normaliseDepartmentName(name));
      if (!departmentId) {
        missingDepartment.push(`${speciality} → ${name}`);
        continue;
      }
      if (already.has(`${specialityId}|${departmentId}`)) continue;
      planned.push({ specialityId, departmentId, label: `${speciality} → ${name}` });
    }
  }

  console.log(`Уже пов’язано: ${existing.length}`);
  console.log(`Буде додано: ${planned.length}\n`);
  for (const p of planned) console.log(`  ${p.label}`);

  // The two lists somebody has to read before pressing --apply. A кафедра that
  // does not match gets no випускові спеціальності, exactly as today.
  if (missingSpeciality.length > 0) {
    console.log(`\nНемає такої спеціальності в базі: ${missingSpeciality.length}`);
    for (const name of missingSpeciality) console.log(`  ${name}`);
  }
  if (missingDepartment.length > 0) {
    console.log(`\nНемає такої кафедри в базі: ${missingDepartment.length}`);
    for (const line of missingDepartment) console.log(`  ${line}`);
  }

  if (planned.length === 0) {
    console.log('\nНічого додавати.');
    return;
  }
  if (!apply) {
    console.log(`\n${planned.length} зв’язків буде створено. Запустіть з --apply, щоб записати.`);
    return;
  }

  await prisma.specialityDepartment.createMany({
    data: planned.map(({ specialityId, departmentId }) => ({ specialityId, departmentId })),
    skipDuplicates: true,
  });
  console.log(`\nСтворено: ${planned.length}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
