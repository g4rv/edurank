import 'dotenv/config';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import { itemTotals, nameKey, readSheet, same, workbooks } from './rating-sheet-2025';

// Trims a person's indicator back to what the university actually awarded.
//
//   pnpm import:trim-2025            report only, deletes nothing
//   pnpm import:trim-2025 --apply    deletes the surplus rows
//
// Run LAST, after the activity, register and division imports, then recompute.
//
// **Some people submitted the same thing more than once.** Гончаренко's
// Розділ_1 holds «декана» twice, «Базова освіта» twice, «Всеукраїнська
// Асоціація» twice — differing only in a capital letter — and «здобуття другої
// вищої освіти» three times. His sheet awards 60, 50, 10 and 200. Ours came to
// 120, 100, 20 and 300: exactly the +220 he was over by.
//
// **Which is NOT the same as «count each thing once».** His three identical
// 1.11 rows are worth 200 on their sheet, not 100 — they counted two of the
// three. The reading that fits is that the «Рейтинг» workbook is a SNAPSHOT: at
// the moment it was generated he had 1.11 twice and 1.6 once, and he
// re-submitted afterwards. The `Розділ_*` files are the current state; his
// workbook was never regenerated.
//
// That is why de-duplicating the source is the wrong fix and was measured to be
// wrong: dropping every repeat took the year from 0.19% under the university's
// total to 0.46% under, because most people's repeats were already there when
// their snapshot was taken and were correctly counted twice.
//
// So this trims to the FIGURE instead. It only ever removes, never adds, and it
// removes only where the surplus is made of copies whose scores add up to the
// difference exactly. Anything else is printed.

const OUT = 'import-report';
const YEAR = 2025;

/**
 * Two rows are the same submission when only case, spacing or punctuation
 * differs — «Всеукраїнська Асоціація…» against «Всеукраїнська асоціація…».
 *
 * Deliberately no looser than that. Коцур Надія's nine publications under 3.9
 * are nine DIFFERENT papers and the sheet counts eight; Юхименко's four Moodle
 * courses are four different disciplines and the sheet counts three. Those are
 * the same snapshot lag seen from the other side — real work added after the
 * workbook was generated — and a fuzzy match would delete it to fit a stale
 * figure.
 */
const evidenceKey = (evidence: unknown) =>
  JSON.stringify(evidence)
    .toLowerCase()
    // Backslash included: an escaped quote inside the stored JSON survives
    // stringify as a stray `\`, and that alone kept two copies of «Всеукраїнська
    // асоціація…» looking like different submissions.
    .replace(/[«»"'’`.,:;()[\]{}!?—–\\-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

async function main() {
  const apply = process.argv.includes('--apply');
  mkdirSync(OUT, { recursive: true });

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });

  try {
    const template = await prisma.ratingTemplate.findUnique({
      where: { year: YEAR },
      select: { status: true },
    });
    if (!template) throw new Error(`No ${YEAR} template`);
    if (template.status !== 'OPEN')
      throw new Error(`${YEAR} is ${template.status}; reopen it first`);

    const roster = JSON.parse(readFileSync('staff-roster.json', 'utf8')) as {
      fullName: string;
      email: string;
    }[];
    const emailByName = new Map(roster.map((r) => [nameKey(r.fullName), r.email.toLowerCase()]));
    const staff = await prisma.staff.findMany({ select: { id: true, email: true } });
    const idByEmail = new Map(staff.map((s) => [s.email.toLowerCase(), s.id]));

    type Row = {
      id: string;
      staffId: string;
      score: number;
      evidence: unknown;
      createdAt: Date;
      activityType: { id: string; itemNumber: string | null };
    };
    const rows: Row[] = await prisma.activity.findMany({
      where: { year: YEAR },
      select: {
        id: true,
        staffId: true,
        score: true,
        evidence: true,
        createdAt: true,
        activityType: { select: { id: true, itemNumber: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const ourRows = new Map<string, Row[]>();
    for (const r of rows) {
      const k = `${r.staffId}|${r.activityType.itemNumber}`;
      ourRows.set(k, [...(ourRows.get(k) ?? []), r]);
    }

    const dropIds: string[] = [];
    const trimmed: { person: string; item: string; from: number; to: number; rows: number }[] = [];
    const stubborn: { person: string; item: string; ours: number; theirs: number }[] = [];

    for (const f of workbooks()) {
      const sheet = await readSheet(f);
      // A blank workbook is not a statement that somebody earned nothing
      if (!sheet || sheet.total === 0) continue;
      const email = emailByName.get(nameKey(sheet.person));
      const staffId = email ? idByEmail.get(email) : undefined;
      if (!staffId) continue;

      const theirs = itemTotals(sheet.blocks);
      for (const [item, target] of theirs) {
        // Only where the sheet actually names a figure. An indicator it shows
        // nothing for is the other problem entirely — the register running
        // ahead of the rating — and zeroing it here would be the tail wagging
        // the dog. It is also where a workbook that merges its item numbers
        // (3.13 and 3.14 under 3.12 in some copies) reads as a zero.
        if (target <= 0) continue;

        const mine: Row[] = ourRows.get(`${staffId}|${item}`) ?? [];
        const ours = mine.reduce((t, r) => t + r.score, 0);
        if (ours <= target || same(ours, target)) continue;

        // The surplus has to be made of copies. Keep the first of each
        // identical submission; everything after it is a candidate to drop.
        const seen = new Set<string>();
        const extras: Row[] = [];
        for (const r of mine) {
          const key = `${r.activityType.id}|${r.score}|${evidenceKey(r.evidence)}`;
          if (seen.has(key)) extras.push(r);
          else seen.add(key);
        }

        let excess = ours - target;
        const drop: Row[] = [];
        for (const r of [...extras].sort((a, b) => b.score - a.score)) {
          if (r.score > excess + 0.005) continue;
          drop.push(r);
          excess -= r.score;
          if (same(excess, 0)) break;
        }

        if (!same(excess, 0)) {
          stubborn.push({ person: sheet.person, item, ours, theirs: target });
          continue;
        }
        dropIds.push(...drop.map((r) => r.id));
        trimmed.push({
          person: sheet.person,
          item,
          from: ours,
          to: target,
          rows: drop.length,
        });
      }
    }

    const points = trimmed.reduce((t, x) => t + (x.from - x.to), 0);
    const people = new Set(trimmed.map((t) => t.person)).size;
    console.log(`rows to delete: ${dropIds.length}`);
    console.log(`points removed: ${Math.round(points)} · people affected: ${people}`);
    console.log(`over the sheet but not made of copies: ${stubborn.length}`);

    const report = [
      `# ${YEAR}: trimmed back to the university's own figures`,
      '',
      `Deleted **${dropIds.length}** rows, **${Math.round(points)}** points, across **${people}** people.`,
      '',
      'Somebody submitted the same thing twice after their «Рейтинг» workbook was',
      'generated, so our total came out above the figure the university published.',
      'Only copies are removed, and only where their scores add up to the',
      'difference exactly.',
      '',
      '| ПІБ | показник | було | стало | рядків |',
      '| --- | --- | --- | --- | --- |',
      ...[...trimmed]
        .sort((a, b) => b.from - b.to - (a.from - a.to))
        .map((t) => `| ${t.person} | ${t.item} | ${t.from} | ${t.to} | ${t.rows} |`),
      '',
      ...(stubborn.length > 0
        ? [
            `## Over the sheet, but not by a whole copy — ${stubborn.length}`,
            '',
            'Left alone. The difference here is not a repeated submission, so removing',
            'a row would be guessing at which one.',
            '',
            '| ПІБ | показник | у нас | у таблиці |',
            '| --- | --- | --- | --- |',
            ...stubborn.map(
              (s) => `| ${s.person} | ${s.item} | ${s.ours.toFixed(2)} | ${s.theirs.toFixed(2)} |`
            ),
            '',
          ]
        : []),
    ].join('\n');
    writeFileSync(join(OUT, `trim-${YEAR}.md`), report, 'utf8');
    console.log(`  → ${OUT}/trim-${YEAR}.md`);

    if (!apply) {
      console.log('\nNothing deleted. Re-run with --apply.');
      return;
    }
    if (dropIds.length === 0) return;

    await prisma.activity.deleteMany({ where: { id: { in: dropIds } } });
    console.log(`\nDeleted ${dropIds.length} rows.`);
    console.log('Next: pnpm db:recompute 2025 · pnpm import:verify-2025');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
