import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import type { Prisma } from '../lib/generated/prisma/client';
import { bookSheetsField, type EvidenceField } from '../lib/rating/evidence-fields';
import { MIN_SHARE_SHEETS } from '../lib/rating/db-specs';
import {
  computeScore,
  personalSheets,
  PAGES_PER_AUTHOR_SHEET,
  roundSheets,
  type ScoringSpec,
} from '../lib/specs/scoring';
import { recomputeRatingEntries } from '../lib/rating/recompute';

// Books in the rating (3.7 монографія, 2.2 видання) are typed in ДРУКОВАНИХ
// АРКУШАХ, not pages (owner, 2026-10-16): «Кількість сторінок» becomes
// «Друкованих аркушів» (one decimal), the person's share is аркуші ÷
// співавтори rounded to 0,1, and a монографія's share must reach 1,5.
//
//   pnpm db:book-sheets            — report only, writes nothing
//   pnpm db:book-sheets --apply    — write it, all in ONE transaction
//
// What it does, in every page-based indicator (`scoring.pageBased`):
//
//   1. The form: the `pages` field becomes `sheets` «Друкованих аркушів», in the
//      same place. A монографія (monograph_ua / monograph_eu) also gets
//      `minShare: 1.5`. In every year, so a closed year still reads right.
//   2. Saved entries of an OPEN year: `pages` becomes `sheets` = pages ÷ 24
//      rounded to 0,1 (3,54645 → 3,5; 3,5634536 → 3,6), the entry is RE-SCORED
//      with the new rule and the person's year total is recomputed. Every entry
//      is printed «було» → «стало», points included.
//   3. A CLOSED year's entries are not touched — its ranking is frozen history.
//
// An entry whose share stays under 1,5 is converted and kept, and listed: the
// form does not re-judge a saved entry, so this is for ННВ to look at on
// /moderation, not for a script to delete.
//
// Why a script: the form and the rule are JSON on the indicator, so the code
// change reaches no database by itself, and production is never seeded again.
// Re-running is harmless: a second run finds nothing to convert.

const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL!) });
const apply = process.argv.includes('--apply');

const MONOGRAPH_CODES = new Set(Object.keys(MIN_SHARE_SHEETS));
const comma = (n: number) => String(n).replace('.', ',');

async function main() {
  const types = await prisma.activityType.findMany({
    select: {
      id: true,
      code: true,
      itemNumber: true,
      coefficient: true,
      coefficientNote: true,
      evidenceFields: true,
      scoring: true,
      template: { select: { year: true, status: true } },
    },
    orderBy: [{ template: { year: 'asc' } }, { itemNumber: 'asc' }],
  });

  const writes: ((tx: Prisma.TransactionClient) => Promise<unknown>)[] = [];
  const touchedStaff = new Map<number, Set<string>>();
  const underFloor: string[] = [];
  let typeCount = 0;
  let entryCount = 0;

  for (const t of types) {
    const scoring = t.scoring as unknown as ScoringSpec;
    if (!scoring?.pageBased) continue;
    const fields = t.evidenceFields as unknown as EvidenceField[];
    const minShare = MONOGRAPH_CODES.has(t.code) ? MIN_SHARE_SHEETS[t.code] : undefined;

    const hasPages = fields.some((f) => f.name === 'pages');
    const nextFields = fields.map((f) => (f.name === 'pages' ? bookSheetsField() : f));
    const nextScoring: ScoringSpec = minShare ? { ...scoring, minShare } : scoring;
    // The note explained the old rule — «др. арк. = сторінок / 24» — and sheets are typed now
    const nextNote = t.coefficientNote?.replace(' (др. арк. = сторінок / 24)', '') ?? null;
    const typeChanged =
      hasPages || nextScoring.minShare !== scoring.minShare || nextNote !== t.coefficientNote;

    if (typeChanged) {
      typeCount += 1;
      console.log(
        `\n• Показник ${t.template.year}, п. ${t.itemNumber ?? '—'} ${t.code} (${t.template.status})`
      );
      if (hasPages) console.log('    поле: «Кількість сторінок» → «Друкованих аркушів» (1 знак)');
      if (nextNote !== t.coefficientNote) {
        console.log(
          `    примітка: «…${t.coefficientNote?.slice(-60)}» → «…${nextNote?.slice(-60)}»`
        );
      }
      if (nextScoring.minShare !== scoring.minShare) {
        console.log(`    мінімальний особистий внесок: немає → ${comma(minShare!)} арк.`);
      }
      writes.push((tx) =>
        tx.activityType.update({
          where: { id: t.id },
          data: {
            evidenceFields: nextFields as unknown as Prisma.InputJsonValue,
            scoring: nextScoring as unknown as Prisma.InputJsonValue,
            coefficientNote: nextNote,
          },
        })
      );
    }

    if (t.template.status === 'CLOSED') continue;

    const activities = await prisma.activity.findMany({
      where: { activityTypeId: t.id },
      select: {
        id: true,
        staffId: true,
        year: true,
        status: true,
        evidence: true,
        computedValue: true,
        score: true,
        staff: { select: { lastName: true, firstName: true } },
      },
    });
    const scorable = {
      code: t.code,
      coefficient: t.coefficient,
      scoring: nextScoring,
      evidenceFields: nextFields,
    };

    for (const a of activities) {
      const evidence = a.evidence as Record<string, unknown>;
      if (evidence.pages === undefined) continue;
      const pages = Number(evidence.pages);
      const sheets = roundSheets(pages / PAGES_PER_AUTHOR_SHEET);
      const { pages: _dropped, ...rest } = evidence;
      void _dropped;
      const next = { ...rest, sheets };
      const result = computeScore(scorable, next);

      entryCount += 1;
      const share = personalSheets(next) as number;
      const who = `${a.staff.lastName} ${a.staff.firstName}`;
      const co = Number(evidence.coAuthors) > 1 ? Number(evidence.coAuthors) : 1;
      console.log(
        `    ${who} (${a.year}, ${a.status}): ${pages} стор. → ${comma(sheets)} арк.` +
          `${co > 1 ? ` ÷ ${co} співавт.` : ''} = внесок ${comma(share)} арк.; бали ${comma(a.score)} → ${comma(result.score)}`
      );
      if (minShare && share < minShare) {
        underFloor.push(`  ! ${who} (${a.year}) — внесок ${comma(share)} < ${comma(minShare)}`);
      }

      writes.push((tx) =>
        tx.activity.update({
          where: { id: a.id },
          data: {
            evidence: next as Prisma.InputJsonValue,
            computedValue: result.computedValue,
            score: result.score,
          },
        })
      );
      const set = touchedStaff.get(a.year) ?? new Set<string>();
      set.add(a.staffId);
      touchedStaff.set(a.year, set);
    }
  }

  console.log(
    `\nПоказників змінюється: ${typeCount}; записів перераховується: ${entryCount}` +
      `${apply ? '' : ' (нічого не записано)'}`
  );
  if (underFloor.length > 0) {
    console.log(
      `\nМонографії з особистим внеском менше мінімуму — залишаються, перевірте на /moderation:`
    );
    for (const l of underFloor) console.log(l);
  }

  if (!apply) {
    if (writes.length > 0) console.log('\nЗапустіть з --apply, щоб записати.');
    return;
  }
  if (writes.length === 0) {
    console.log('\nНічого змінювати.');
    return;
  }

  await prisma.$transaction(
    async (tx) => {
      for (const w of writes) await w(tx);
      // The year totals follow the re-scored entries, in the same transaction
      for (const [year, staff] of touchedStaff) {
        await recomputeRatingEntries(tx, [...staff], year);
      }
    },
    { timeout: 120_000 }
  );
  const people = [...touchedStaff.values()].reduce((n, s) => n + s.size, 0);
  console.log(`\nЗаписано. Підсумки рейтингу перераховано для ${people} осіб.`);
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
