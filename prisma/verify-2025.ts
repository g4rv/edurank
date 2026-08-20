import 'dotenv/config';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import { nameKey, readSheet, workbooks } from './rating-sheet-2025';

// Checks the imported year against the university's own arithmetic.
//
//   pnpm import:verify-2025
//
// Every `Таблиці_Викладачів` workbook carries «Всього балів по розділу N» and
// «Загальна сума балів» — the figures the old system produced and the ones
// people recognise. This compares them, per person and per розділ, against the
// `RatingEntry` our engine computed from the imported activities.
//
// It writes nothing. The point is a number somebody can argue with: an import
// that is 3% short is finished, and one that is 40% short is not, and only a
// per-розділ comparison tells the two apart.
//
// **A розділ that is short everywhere is usually not a scoring bug.** Розділи 1
// and 2 are largely filled in by ННВ and ННЦЗЯО, and those values live ONLY in
// this «Рейтинг» sheet — the `Розділ_*` workbooks the activities come from have
// no row for them at all. See docs/legacy-import.md.

const OUT = 'import-report';
const YEAR = 2025;

async function main() {
  mkdirSync(OUT, { recursive: true });
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });

  try {
    const roster = JSON.parse(readFileSync('staff-roster.json', 'utf8')) as {
      fullName: string;
      email: string;
    }[];
    const emailByName = new Map(roster.map((r) => [nameKey(r.fullName), r.email.toLowerCase()]));

    const staff = await prisma.staff.findMany({
      select: {
        id: true,
        email: true,
        lastName: true,
        firstName: true,
        patronymic: true,
        department: { select: { name: true } },
        ratingEntries: {
          where: { year: YEAR },
          select: {
            totalScore: true,
            section1Score: true,
            section2Score: true,
            section3Score: true,
            section4Score: true,
            section5Score: true,
          },
        },
      },
    });
    const byEmail = new Map(staff.map((s) => [s.email.toLowerCase(), s]));

    const files = workbooks();
    console.log(`workbooks: ${files.length}`);

    interface Row {
      name: string;
      department: string;
      theirs: number[];
      ours: number[];
      theirTotal: number;
      ourTotal: number;
    }
    const rows: Row[] = [];
    let blank = 0;
    let unmatched = 0;

    for (const f of files) {
      const sheet = await readSheet(f);
      // 30 of the workbooks are the untouched blank form — never a source
      if (!sheet || sheet.total === 0) {
        blank += 1;
        continue;
      }
      const email = emailByName.get(nameKey(sheet.person));
      const person = email ? byEmail.get(email) : undefined;
      if (!person) {
        unmatched += 1;
        continue;
      }
      const e = person.ratingEntries[0];
      rows.push({
        name: `${person.lastName} ${person.firstName} ${person.patronymic}`.trim(),
        department: person.department?.name ?? '—',
        theirs: sheet.sections,
        ours: e
          ? [e.section1Score, e.section2Score, e.section3Score, e.section4Score, e.section5Score]
          : [0, 0, 0, 0, 0],
        theirTotal: sheet.total,
        ourTotal: e?.totalScore ?? 0,
      });
    }

    const sum = (pick: (r: Row) => number) => rows.reduce((t, r) => t + pick(r), 0);
    const theirSum = sum((r) => r.theirTotal);
    const ourSum = sum((r) => r.ourTotal);

    console.log(
      `compared: ${rows.length} · blank or unscored: ${blank} · not our people: ${unmatched}`
    );
    console.log(`\nрозділ |     їхнє |      наше |      різниця | %`);
    for (let i = 0; i < 5; i++) {
      const t = sum((r) => r.theirs[i]);
      const o = sum((r) => r.ours[i]);
      console.log(
        `   ${i + 1}   | ${t.toFixed(0).padStart(8)} | ${o.toFixed(0).padStart(9)} | ` +
          `${(o - t).toFixed(0).padStart(12)} | ${((o / (t || 1)) * 100).toFixed(0)}%`
      );
    }
    console.log(
      `разом  | ${theirSum.toFixed(0).padStart(8)} | ${ourSum.toFixed(0).padStart(9)} | ` +
        `${(ourSum - theirSum).toFixed(0).padStart(12)} | ${((ourSum / (theirSum || 1)) * 100).toFixed(0)}%`
    );

    const close = rows.filter((r) => Math.abs(r.ourTotal - r.theirTotal) < 0.51).length;
    console.log(`\nexact to the last 0.5:  ${close} of ${rows.length}`);

    const worst = [...rows].sort(
      (a, b) => Math.abs(b.ourTotal - b.theirTotal) - Math.abs(a.ourTotal - a.theirTotal)
    );
    console.log('\nfurthest apart:');
    for (const r of worst.slice(0, 10)) {
      console.log(
        `  ${r.name.padEnd(36)} їхнє ${r.theirTotal.toFixed(2).padStart(9)}  наше ${r.ourTotal.toFixed(2).padStart(9)}`
      );
    }

    const report = [
      `# ${YEAR}: our totals against the university's own`,
      '',
      `Compared **${rows.length}** people. Blank or unscored workbooks: ${blank}. ` +
        `In the folder but not on our roster: ${unmatched}.`,
      '',
      `Exact to the last 0.5: **${close}**.`,
      '',
      '| розділ | їхнє | наше | різниця |',
      '| --- | --- | --- | --- |',
      ...[0, 1, 2, 3, 4].map((i) => {
        const t = sum((r) => r.theirs[i]);
        const o = sum((r) => r.ours[i]);
        return `| ${i + 1} | ${t.toFixed(0)} | ${o.toFixed(0)} | ${(o - t).toFixed(0)} |`;
      }),
      `| **разом** | **${theirSum.toFixed(0)}** | **${ourSum.toFixed(0)}** | **${(ourSum - theirSum).toFixed(0)}** |`,
      '',
      '## Кожен НПП',
      '',
      '| ПІБ | кафедра | р.1 | р.2 | р.3 | р.4 | р.5 | їхнє | наше | різниця |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
      ...worst.map((r) => {
        const d = r.ours.map((o, i) => (o - r.theirs[i]).toFixed(0)).join(' | ');
        return (
          `| ${r.name} | ${r.department} | ${d} | ` +
          `${r.theirTotal.toFixed(2)} | ${r.ourTotal.toFixed(2)} | ${(r.ourTotal - r.theirTotal).toFixed(2)} |`
        );
      }),
      '',
    ].join('\n');
    writeFileSync(join(OUT, `verify-${YEAR}.md`), report, 'utf8');
    console.log(`\n  → ${OUT}/verify-${YEAR}.md`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
