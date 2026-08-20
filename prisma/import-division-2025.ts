import 'dotenv/config';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '../lib/generated/prisma/client';
import { parseTypeSpecs } from '../validations/activity-type-spec';
import { computeScore } from '../lib/rating/scoring';
import { nameKey, readSheet, same, tidy, workbooks } from './rating-sheet-2025';

// The half of 2025 that the `Розділ_*` workbooks do not contain.
//
//   pnpm import:division-2025            report only, writes nothing
//   pnpm import:division-2025 --apply    writes it
//
// Run AFTER `pnpm import:activities-2025 --apply`.
//
// A `Розділ_N` file is what the НПП reported about themselves. Everything ННВ,
// ННЦЗЯО and ВМЗ fill in — навчальне навантаження, гарант освітньої програми,
// стаж, звання, ступінь, h-індекс, робота у спецрадах — was typed straight into
// the «Рейтинг» sheet and exists nowhere else. It is 28% of the university's
// own total: розділи 1 and 2 came out at 38% and 40% without it.
//
// **Every number here is theirs, and it is checked.** A row gives the
// indicator, the choice, its price and what the person earned; this works out
// how many occurrences that is, prices them through our own engine, and refuses
// any row whose arithmetic does not land back on the sheet's figure. Nothing is
// rounded into place.
//
// **A person who already holds that indicator is skipped**, so nothing is
// counted twice. Where the Розділ file supplied some of an indicator and the
// sheet says more, the Розділ rows win — they carry the evidence text, and a
// second row invented here would be a number with no source behind it.

const OUT = 'import-report';
const YEAR = 2025;

const norm = (s: string) =>
  tidy(s)
    .toLowerCase()
    .replace(/^\d+\.\d+\.?\s*/, '')
    .replace(/[«»"'’`]/g, '')
    .replace(/[.,:;()]/g, ' ')
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
      select: {
        id: true,
        status: true,
        activityTypes: {
          select: {
            id: true,
            code: true,
            itemNumber: true,
            label: true,
            coefficient: true,
            evidenceFields: true,
            scoring: true,
          },
        },
      },
    });
    if (!template) throw new Error(`No ${YEAR} template — run pnpm import:template-2025 --apply`);
    if (template.status !== 'OPEN')
      throw new Error(`${YEAR} is ${template.status}; reopen it first`);

    const byItem = new Map(template.activityTypes.map((t) => [t.itemNumber, t]));

    const roster = JSON.parse(readFileSync('staff-roster.json', 'utf8')) as {
      fullName: string;
      email: string;
    }[];
    const emailByName = new Map(roster.map((r) => [nameKey(r.fullName), r.email.toLowerCase()]));
    const staff = await prisma.staff.findMany({ select: { id: true, email: true } });
    const idByEmail = new Map(staff.map((s) => [s.email.toLowerCase(), s.id]));

    // What the Розділ import already gave each person. One query, because the
    // alternative is 300 people × 53 indicators of round trips.
    const held = new Set(
      (
        await prisma.activity.findMany({
          where: { year: YEAR },
          select: { staffId: true, activityTypeId: true },
          distinct: ['staffId', 'activityTypeId'],
        })
      ).map((a) => `${a.staffId}|${a.activityTypeId}`)
    );

    const files = workbooks();
    console.log(`workbooks: ${files.length}`);

    const ready: Prisma.ActivityCreateManyInput[] = [];
    const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
    const noPerson = new Map<string, number>();
    const alreadyHeld = new Map<string, number>();
    const noIndicator = new Map<string, number>();
    const noChoice = new Map<string, number>();
    const wrongTotal = new Map<string, number>();
    /** points this would add, per indicator — the reason to run it */
    const gained = new Map<string, number>();
    /**
     * Blocks where the amount, not the sheet, decided which choice it was.
     *
     * The SCORE is still the university's own and is checked against it — only
     * the wording of the choice is worked out. The evidence text says so,
     * because «голова спеціалізованої вченої ради» against «член» is a claim
     * about a person and nobody should read one off an import unwarned.
     */
    let inferred = 0;
    /** A block the amount cannot settle — written out in full for a person */
    interface Undecided {
      person: string;
      itemNumber: string;
      label: string;
      earned: number;
      /** «член ради × 32 (по 50)» — every reading that divides the amount */
      readings: string[];
      /** the indicator's whole price list, for a reader who knows the person */
      choices: string[];
    }
    const undecided: Undecided[] = [];

    for (const f of files) {
      const sheet = await readSheet(f);
      if (!sheet) continue;

      const email = emailByName.get(nameKey(sheet.person));
      const staffId = email ? idByEmail.get(email) : undefined;
      if (!staffId) {
        if (sheet.blocks.length > 0) bump(noPerson, sheet.person);
        continue;
      }

      for (const r of sheet.blocks) {
        const shown = r.labels[0] ?? '';
        const type = byItem.get(r.itemNumber);
        if (!type) {
          bump(noIndicator, `${r.itemNumber} «${shown.slice(0, 40)}»`);
          continue;
        }
        if (held.has(`${staffId}|${type.id}`)) {
          bump(alreadyHeld, r.itemNumber);
          continue;
        }

        let specs;
        try {
          specs = parseTypeSpecs(type);
        } catch {
          bump(noIndicator, `${r.itemNumber}: broken specs`);
          continue;
        }
        const scorable = {
          code: type.code,
          coefficient: type.coefficient,
          scoring: specs.scoring,
          evidenceFields: specs.fields,
        };

        const select = specs.fields.find((f) => f.kind === 'select' && f.name === 'option');

        // Which of the block's lines was the one they earned it for.
        //
        // Usually the block names exactly one choice and that is the answer —
        // «Scopus» under 3.28, «доцент» under 1.2. Only where the score is
        // merged across a heading and several choices does the sheet stop
        // saying, and then the amount has to: the choice is the one a single
        // occurrence explains exactly, or failing that the only price that
        // divides it.
        //
        // «Only» matters. Under 1.2, 30 points is доцент once, but it is also
        // старший викладач twice and викладач three times; without the exact
        // rule first, a доцент would import as two старші викладачі. Where
        // nothing is exact and more than one price divides, the block is
        // reported rather than guessed at.
        let chosen: { value: string; points?: number } | undefined;
        let occurrences = 1;
        let fromAmount = false;
        if (select && select.kind === 'select') {
          const named = r.labels.map(norm);
          const inBlock = select.options.filter(
            (o) =>
              named.includes(norm(o.label)) ||
              named.some((l) => l.length > 0 && norm(o.label).startsWith(`${l} `))
          );
          // Some indicators put the figure on the heading alone and never on
          // a choice — 3.17 спецради, 1.8 методичні ради, 3.1 and 3.4. There
          // the sheet genuinely does not record WHICH, so every choice is a
          // candidate and the amount is all there is to go on.
          const heading = r.labels.some((l) => norm(l) === norm(type.label));
          const pool = inBlock.length > 0 ? inBlock : heading ? [...select.options] : [];
          if (pool.length === 0) {
            bump(noChoice, `${r.itemNumber} «${shown.slice(0, 40)}»`);
            continue;
          }
          if (pool.length === 1) {
            chosen = pool[0];
          } else {
            const exact = pool.filter((o) => o.points !== undefined && same(o.points, r.earned));
            if (exact.length === 1) {
              chosen = exact[0];
            } else {
              const divides = pool.filter(
                (o) => o.points !== undefined && o.points > 0 && r.earned % o.points === 0
              );
              if (divides.length !== 1) {
                // Written out in full for a person to settle — the amount is
                // certain and only the role is not, so these are 74 questions
                // with a short list of answers each, not 74 mysteries.
                undecided.push({
                  person: sheet.person,
                  itemNumber: r.itemNumber,
                  label: type.label,
                  earned: r.earned,
                  readings: divides.map(
                    (o) => `${o.label} × ${r.earned / (o.points as number)} (по ${o.points})`
                  ),
                  choices: select.options.map((o) => `${o.label} — ${o.points}`),
                });
                bump(
                  noChoice,
                  `${r.itemNumber} «${shown.slice(0, 30)}» ${r.earned} fits ${divides.length} prices`
                );
                continue;
              }
              chosen = divides[0];
            }
            fromAmount = true;
            inferred += 1;
          }
        } else if (!r.labels.some((l) => norm(l) === norm(type.label))) {
          bump(noChoice, `${r.itemNumber} «${shown.slice(0, 40)}»`);
          continue;
        }

        const evidence: Record<string, unknown> = {
          title:
            `${shown} — з таблиці рейтингу ${YEAR}` +
            (fromAmount ? '; варіант визначено за сумою балів' : ''),
        };
        if (chosen) evidence.option = chosen.value;

        // The price of one — the chosen option's, or the indicator's own where
        // it has no choices.
        const price = chosen?.points ?? type.coefficient;

        // An indicator that carries a quantity takes the whole figure in one
        // row: 227 годин of навантаження at a point each, an h-індекс of 1 at
        // 100, 1.969 of a Moodle course's obligatory items at 150. One that
        // does not is a count of occurrences instead.
        const quantityField = specs.fields.find((f) => f.name === 'value' || f.name === 'credits');
        if (quantityField) {
          evidence[quantityField.name] = r.earned / (price || 1);
        } else {
          if (!price || r.earned % price !== 0) {
            bump(wrongTotal, `${r.itemNumber}: ${r.earned} is not a multiple of ${price}`);
            continue;
          }
          occurrences = r.earned / price;
          // Dozens of occurrences is not somebody who did the thing dozens of
          // times — it is an indicator priced per unit and read as a flat award.
          if (occurrences > 50) {
            bump(wrongTotal, `${r.itemNumber}: ${occurrences} occurrences at ${price} each`);
            continue;
          }
        }

        let priced;
        try {
          priced = computeScore(scorable, evidence);
        } catch (e) {
          bump(wrongTotal, `${r.itemNumber}: ${(e as Error).message.slice(0, 50)}`);
          continue;
        }
        // The whole point of the exercise: our arithmetic has to land on theirs.
        if (!same(priced.score * occurrences, r.earned)) {
          bump(
            wrongTotal,
            `${r.itemNumber}: ours ${priced.score * occurrences} vs theirs ${r.earned}`
          );
          continue;
        }

        for (let n = 0; n < occurrences; n++) {
          ready.push({
            staffId,
            activityTypeId: type.id,
            year: YEAR,
            evidence: evidence as Prisma.InputJsonValue,
            computedValue: priced.computedValue,
            score: priced.score,
            status: 'APPROVED',
            submittedByRole: 'SYSTEM',
            approvedAt: new Date(),
          });
        }
        gained.set(r.itemNumber, (gained.get(r.itemNumber) ?? 0) + r.earned);
      }
    }

    console.log(`\nrows to write: ${ready.length}`);
    const total = [...gained.values()].reduce((s, v) => s + v, 0);
    console.log(`points they carry: ${Math.round(total)}`);
    console.log(`choice worked out from the amount: ${inferred} of them`);
    const lost = [
      ['person not on the roster', noPerson],
      ['already imported from a Розділ file', alreadyHeld],
      ['no such indicator in the template', noIndicator],
      ['the line names no choice we know', noChoice],
      ["our arithmetic does not match the sheet's", wrongTotal],
    ] as const;
    for (const [what, m] of lost) {
      const n = [...m.values()].reduce((s, v) => s + v, 0);
      if (n > 0) console.log(`  ${what}: ${n} (${m.size} distinct)`);
    }
    console.log('\npoints gained per indicator:');
    for (const [item, points] of [...gained].sort((a, b) => b[1] - a[1]).slice(0, 20))
      console.log(`  ${item.padEnd(6)} ${Math.round(points)}`);

    const report = [
      `# ${YEAR}: what only the «Рейтинг» sheet has`,
      '',
      `Rows to write: **${ready.length}**, carrying **${Math.round(total)}** points.`,
      '',
      '| показник | балів |',
      '| --- | --- |',
      ...[...gained].sort((a, b) => b[1] - a[1]).map(([i, p]) => `| ${i} | ${Math.round(p)} |`),
      '',
      ...lost.flatMap(([what, m]) => {
        const n = [...m.values()].reduce((s, v) => s + v, 0);
        if (n === 0) return [];
        return [
          `## ${what} — ${n} rows`,
          '',
          ...[...m]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 40)
            .map(([k, v]) => `- \`${v}×\` ${k}`),
          '',
        ];
      }),
    ].join('\n');
    writeFileSync(join(OUT, `division-${YEAR}.md`), report, 'utf8');
    console.log(`\n  → ${OUT}/division-${YEAR}.md`);

    // The questions, one per block, grouped by indicator so a reader answers
    // «what does 3.17 mean here» once rather than 43 times.
    const byIndicator = new Map<string, Undecided[]>();
    for (const u of undecided) {
      const key = `${u.itemNumber} ${u.label}`;
      byIndicator.set(key, [...(byIndicator.get(key) ?? []), u]);
    }
    /**
     * The choices of one indicator, minus the words they all share.
     *
     * 3.18's nine choices open with the same fourteen words and differ only in
     * «категорії "А"/"Б"» and the role, so printed in full the price list is
     * 1 400 characters of the same sentence and nobody reads it.
     */
    const shorten = (labels: string[]): string[] => {
      const words = labels.map((l) => l.split(' '));
      let n = 0;
      while (n < words[0].length && words.every((w) => w[n] === words[0][n])) n += 1;
      return labels.map((l) => l.split(' ').slice(n).join(' ') || l);
    };

    const questions = [
      `# ${YEAR}: the blocks the sheet does not settle`,
      '',
      `**${undecided.length}** blocks, worth **${Math.round(
        undecided.reduce((t, u) => t + u.earned, 0)
      )}** points.`,
      '',
      "The «Рейтинг» sheet records the total against the indicator's heading and",
      'never says which role earned it, and more than one price divides that total.',
      'The amount is certain; only the role is not — and whichever is chosen, the',
      "person's score is the same. It changes the wording, not the number.",
      '',
      ...[...byIndicator]
        .sort((a, b) => b[1].length - a[1].length)
        .flatMap(([key, list]) => {
          const short = shorten(list[0].choices);
          return [
            `## ${key}`,
            '',
            `${list.length} ${list.length === 1 ? 'блок' : 'блоків'}, ` +
              `${Math.round(list.reduce((t, u) => t + u.earned, 0))} балів. Ціни:`,
            '',
            ...short.map((c) => `- ${c}`),
            '',
            '| НПП | балів | читається як |',
            '| --- | --- | --- |',
            ...list
              .sort((a, b) => b.earned - a.earned)
              .map((u) => {
                const readings = shorten(u.readings.length > 1 ? u.readings : [...u.readings, ''])
                  .filter(Boolean)
                  .join(' **або** ');
                return `| ${u.person} | ${u.earned} | ${readings || 'жодна ціна не ділить'} |`;
              }),
            '',
          ];
        }),
    ].join('\n');
    writeFileSync(join(OUT, `ambiguous-${YEAR}.md`), questions, 'utf8');
    console.log(`  → ${OUT}/ambiguous-${YEAR}.md  (${undecided.length} blocks to settle)`);

    if (!apply) {
      console.log('\nNothing written. Re-run with --apply.');
      return;
    }

    await prisma.$transaction(async (tx) => tx.activity.createMany({ data: ready }), {
      timeout: 300_000,
    });
    console.log(`\nWritten: ${ready.length} activities for ${YEAR}.`);
    console.log('Next: pnpm db:recompute 2025 · pnpm import:verify-2025');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
