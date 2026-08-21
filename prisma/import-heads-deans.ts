import 'dotenv/config';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import ExcelJS from 'exceljs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import { normaliseDepartmentName } from '../lib/specialities/departments';
import { byFullName, nameKey, tidy, text } from './rating-sheet-2025';

// Who leads what — from the university's own two lists.
//
//   pnpm import:heads            report only, writes nothing
//   pnpm import:heads --apply    writes them
//
// `Department.headId` and `Faculty.deanId` were empty for all 31 кафедри and
// all 8 факультети, so nobody could open their own кафедра's розподіл: headship
// is not a Role, it is derived from these two columns (CLAUDE.md), and with
// them unset only an ADMIN could do anything.
//
// Both lists live in `УГСП_Дані.xlsx`, and they are written differently:
//
//   «Кафедри»     c1 кафедра · c2 завідувач, full ПІБ
//   «Факультети»  c1 факультет · c3 декан, as «Дем’яненко Б.Л.» — INITIALS
//
// So a декан is matched on surname plus both initials, and only where exactly
// one person answers. All eight resolve to one person each; «Ігнатенко Н.В.»
// the декан and «Ігнатенко Микола Миколайович» the завідувач кафедри економіки
// are two different people, which is precisely why a surname alone is not
// enough to match on.
//
// **A завідувач may not also be a декан** (`headDeanConflict`), so both sides
// are resolved first and the pair is refused if anybody appears in both. Today
// nobody does.

const OUT = 'import-report';

/**
 * A кафедра or факультет name as both documents spell it.
 *
 * Three differences to forgive, all of them punctuation rather than meaning:
 * the «Кафедра»/«Факультет» prefix we store and they omit; «і» against «та»,
 * which the folders swap in both directions; and «І.П.Стогнія» against our
 * «І. П. Стогнія».
 */
const key = (name: string) =>
  normaliseDepartmentName(name)
    .replace(/^факультет\s+/, '')
    .replace(/\.\s*/g, '. ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(^|\s)(і|та|й)(\s|$)/g, '$1&$3');

interface Post {
  kind: 'кафедра' | 'факультет';
  unitId: string;
  unitName: string;
  staffId: string;
  person: string;
  /** as the sheet wrote it */
  written: string;
}

async function main() {
  const apply = process.argv.includes('--apply');
  mkdirSync(OUT, { recursive: true });

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });

  try {
    const staff = await prisma.staff.findMany({
      where: { isSystem: false, archivedAt: null },
      select: { id: true, lastName: true, firstName: true, patronymic: true },
    });
    const byName = byFullName(staff);

    const [departments, faculties] = await Promise.all([
      prisma.department.findMany({ select: { id: true, name: true, headId: true } }),
      prisma.faculty.findMany({ select: { id: true, name: true, deanId: true } }),
    ]);
    const deptBy = new Map(departments.map((d) => [key(d.name), d]));
    const facBy = new Map(faculties.map((f) => [key(f.name), f]));

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile('edu-reference/УГСП_Дані.xlsx');

    const posts: Post[] = [];
    const skipped: string[] = [];

    wb.getWorksheet('Кафедри')?.eachRow({ includeEmpty: false }, (row, n) => {
      if (n === 1) return;
      const unit = tidy(text(row.getCell(1).value));
      const written = tidy(text(row.getCell(2).value));
      if (!unit || !written) return;
      const department = deptBy.get(key(unit));
      // «Проректор» sits in the кафедра column as a placeholder for Дудар
      // Василь, who leads no кафедра. It is not a кафедра and never was.
      if (!department) {
        skipped.push(`кафедра «${unit}» — такої кафедри в системі немає (завідувач ${written})`);
        return;
      }
      const person = byName.get(nameKey(written));
      if (!person) {
        skipped.push(`${written} — особи немає в системі (кафедра «${unit}»)`);
        return;
      }
      posts.push({
        kind: 'кафедра',
        unitId: department.id,
        unitName: department.name,
        staffId: person.id,
        person: `${person.lastName} ${person.firstName} ${person.patronymic}`.trim(),
        written,
      });
    });

    wb.getWorksheet('Факультети')?.eachRow({ includeEmpty: false }, (row, n) => {
      if (n === 1) return;
      const unit = tidy(text(row.getCell(1).value));
      const written = tidy(text(row.getCell(3).value));
      if (!unit || !written) return;
      const faculty = facBy.get(key(unit));
      if (!faculty) {
        skipped.push(`факультет «${unit}» — такого факультету в системі немає (декан ${written})`);
        return;
      }
      // «Дем’яненко Б.Л.» — surname and both initials, never the surname alone
      const parsed = /^(.+?)\s+([А-ЯІЇЄҐ])\.\s*([А-ЯІЇЄҐ])\./u.exec(written);
      if (!parsed) {
        skipped.push(`«${written}» — не вдалося розібрати ПІБ декана (факультет «${unit}»)`);
        return;
      }
      const [, last, i1, i2] = parsed;
      const hits = staff.filter(
        (s) =>
          s.lastName.toLowerCase() === last.toLowerCase() &&
          s.firstName.startsWith(i1) &&
          (s.patronymic ?? '').startsWith(i2)
      );
      if (hits.length !== 1) {
        skipped.push(
          `«${written}» — ${hits.length === 0 ? 'нікого не знайдено' : `знайдено ${hits.length} осіб`} (факультет «${unit}»)`
        );
        return;
      }
      posts.push({
        kind: 'факультет',
        unitId: faculty.id,
        unitName: faculty.name,
        staffId: hits[0].id,
        person: `${hits[0].lastName} ${hits[0].firstName} ${hits[0].patronymic}`.trim(),
        written,
      });
    });

    // A завідувач is never also a декан. Checked across the WHOLE pair before
    // anything is written: setting them one at a time would let the first half
    // land and the second be refused, leaving the university half-configured.
    const heads = new Set(posts.filter((p) => p.kind === 'кафедра').map((p) => p.staffId));
    const clashes = posts.filter((p) => p.kind === 'факультет' && heads.has(p.staffId));

    console.log(`завідувачів: ${posts.filter((p) => p.kind === 'кафедра').length} з 31 кафедри`);
    console.log(
      `деканів:     ${posts.filter((p) => p.kind === 'факультет').length} з 8 факультетів`
    );
    for (const p of posts)
      console.log(`  ${p.kind.padEnd(10)} ${p.unitName.slice(0, 46).padEnd(46)} ${p.person}`);
    if (skipped.length) {
      console.log(`\nне зіставлено (${skipped.length}):`);
      for (const s of skipped) console.log(`  ${s}`);
    }
    if (clashes.length) {
      console.log('\nКОНФЛІКТ — ця людина і завідувач, і декан:');
      for (const c of clashes) console.log(`  ${c.person} — ${c.unitName}`);
      console.log('Нічого не записано. Спершу розберіться, хто з них хто.');
      process.exitCode = 1;
      return;
    }

    writeFileSync(
      join(OUT, 'heads-deans.md'),
      [
        '# Завідувачі та декани з УГСП_Дані.xlsx',
        '',
        `Завідувачів: **${posts.filter((p) => p.kind === 'кафедра').length}** · деканів: **${posts.filter((p) => p.kind === 'факультет').length}**`,
        '',
        '| підрозділ | посада | ПІБ | як записано у файлі |',
        '| --- | --- | --- | --- |',
        ...posts.map(
          (p) =>
            `| ${p.unitName} | ${p.kind === 'кафедра' ? 'завідувач' : 'декан'} | ${p.person} | ${p.written} |`
        ),
        '',
        ...(skipped.length
          ? [`## Не зіставлено — ${skipped.length}`, '', ...skipped.map((s) => `- ${s}`), '']
          : []),
      ].join('\n'),
      'utf8'
    );
    console.log(`\n  → ${OUT}/heads-deans.md`);

    if (!apply) {
      console.log('\nНічого не записано. Запустіть з --apply.');
      return;
    }

    await prisma.$transaction(async (tx) => {
      for (const p of posts) {
        if (p.kind === 'кафедра')
          await tx.department.update({ where: { id: p.unitId }, data: { headId: p.staffId } });
        else await tx.faculty.update({ where: { id: p.unitId }, data: { deanId: p.staffId } });
      }
    });
    console.log(`\nЗаписано: ${posts.length} призначень.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
