import 'dotenv/config';
import { readFileSync } from 'fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '../lib/generated/prisma/client';
import { specProblems } from '../validations/activity-type-spec';

// Writes the 2025 rating template into the database, from what
// `pnpm legacy:template` read out of the university's own sheets.
//
//   pnpm legacy:template            first — produces import-report/template-2025.json
//   pnpm import:template-2025       shows what would be written
//   pnpm import:template-2025 --apply   writes it
//
// **Structure only.** No activities, no scores, no people. This creates the
// year and its 53 indicators so there is something for the activities to hang
// off, and so `/admin/rating/2025` can be looked at before anything else lands.
//
// The year is created **OPEN and inactive**, not closed. Closed is where it ends
// up (owner, 2026-08-19), but `closeYear` is what writes the per-person
// snapshots and it has nothing to snapshot yet. Closing an empty year would
// freeze a blank document. Inactive means the app will not accept submissions
// against it in the meantime — `createActivity` checks `template.isActive`.

const OUT = 'import-report/template-2025.json';
const YEAR = 2025;

const SECTION_TITLES: Record<number, string> = {
  1: 'Показники професійного розвитку',
  2: 'Навчально-методична робота',
  3: 'Науково-дослідна робота',
  4: 'Організаційно-виховна робота',
  5: 'Навчально-методичне забезпечення навчальних дисциплін',
};

interface Option {
  label: string;
  points: number | null;
}
interface Indicator {
  section: number;
  itemNumber: string;
  label: string;
  coefficient: number | null;
  unit: string | null;
  enteredBy: string | null;
  options: Option[];
}

/**
 * `item_3_9` — derived from the number, not guessed from the wording.
 *
 * `code` only has to be unique inside its own template, and a year owns its
 * structure, so there is nothing to reconcile with 2026. Deriving it means an
 * imported indicator can always be traced back to the printed form, which a
 * semantic slug invented here could not.
 */
const codeFor = (i: Indicator) => `item_${i.itemNumber.replace(/\./g, '_')}`;

/**
 * How the sheet's shape becomes a scoring rule.
 *
 * - options with points → SELECT: «одноосібно 250 / співавторство 150»
 * - a unit that multiplies → MULT: «1 бал за рік», «10 балів*1ст./с.а.»
 * - anything else        → FIXED
 *
 * The engine refuses a rule whose fields do not match it (`specProblems`), so
 * the fields are built from the same branch rather than alongside it.
 */
function specsFor(i: Indicator): {
  kind: 'FIXED' | 'MULT' | 'SELECT' | 'SELECT_MULT';
  coefficient: number;
  fields: unknown[];
} {
  const proof = { kind: 'text', name: 'title', label: 'Підтвердження', multiline: true };

  // «бал за рік», «балів* др.а./с.а.», «балів кредит 10», «за кожну лекцію» —
  // all say «× a number».
  //
  // So, less obviously, does 5.1's «за умови заповнення усіх обов'язкових
  // пунктів». It reads like a condition and is a proportion: a Moodle course
  // with every obligatory item pays the full 150, and a partly filled one pays
  // its share. The Розділ rows carry that share in column 3 — Гуральчук's
  // eleven disciplines are 0.175 each and her sheet says 295.35, which is
  // 150 × 1.969 to the last digit. Priced flat they came to 1650. It is the
  // same idea as 2026's CHECK_SUM, recorded as the fraction it worked out to.
  const multiplies = !!i.unit && /(за рік|кредит|за кожну|за 1 |за умови|\*|\/)/.test(i.unit);

  const scored = i.options.filter((o) => o.points !== null);
  if (scored.length > 0) {
    const select = {
      kind: 'select',
      name: 'option',
      label: 'Варіант',
      options: scored.map((o, n) => ({
        value: `o${n + 1}`,
        label: o.label,
        points: o.points as number,
      })),
    };

    // Both a choice AND a quantity — 3.7 «Видання монографії» is priced by
    // language (українською 150 / мовою ЄС 250) and then multiplied by
    // друковані аркуші. Дудар's 2025 row carries 0.5, half a sheet's share, and
    // a plain SELECT would throw that away and score him a whole monograph.
    if (multiplies) {
      return {
        kind: 'SELECT_MULT',
        coefficient: 1,
        fields: [
          select,
          { kind: 'number', name: 'credits', label: i.unit ?? 'Кількість', min: 0 },
          proof,
        ],
      };
    }

    return {
      kind: 'SELECT',
      // Points live on the options for a SELECT; the coefficient multiplies them
      coefficient: 1,
      fields: [select, proof],
    };
  }

  // A price of exactly 1 point is not a flat award. Nothing in the document
  // pays one point for a thing done — it is the sheet's «1 бал за одиницю», and
  // 2.1 «Виконання навчального навантаження» is the indicator that uses it:
  // 227 годин is 227 points, not one. Priced flat it also produced 227 separate
  // activity rows on the way to the same number (2026-08-20).
  if ((multiplies || i.coefficient === 1) && i.coefficient !== null) {
    return {
      kind: 'MULT',
      coefficient: i.coefficient,
      fields: [{ kind: 'number', name: 'value', label: i.unit ?? 'Кількість', min: 0 }, proof],
    };
  }

  return { kind: 'FIXED', coefficient: i.coefficient ?? 0, fields: [proof] };
}

/**
 * «Дані внесені» names the відділ that types the value in; blank means the НПП
 * submits it themselves. The division is matched by `registryKey`, never by
 * name — a rename on /divisions must not orphan an indicator.
 */
const DIVISION_KEYS: Record<string, string> = {
  ННВ: 'NNV',
  ННЦЗЯО: 'NNCZYAO',
  ВМЗ: 'VMZ',
  'Відділ кадрів': 'KADRY',
  Кадри: 'KADRY',
};

async function main() {
  const apply = process.argv.includes('--apply');
  const replace = process.argv.includes('--replace');
  const indicators = JSON.parse(readFileSync(OUT, 'utf8')) as Indicator[];
  if (indicators.length === 0) throw new Error(`${OUT} is empty — run pnpm legacy:template first`);

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });

  try {
    const existing = await prisma.ratingTemplate.findUnique({
      where: { year: YEAR },
      select: { id: true, status: true, _count: { select: { activityTypes: true } } },
    });
    if (existing && !replace) {
      console.log(
        `Рік ${YEAR} вже існує (${existing.status}, ${existing._count.activityTypes} показників).`
      );
      console.log('Nothing written. Pass --replace to rebuild it from the sheets.');
      return;
    }
    // Rebuilding the template means rebuilding its indicators, and every
    // imported Activity points at one of those rows — so the year's activities
    // go with it. Nothing is lost that the sheets cannot produce again, but a
    // year somebody has been WORKING in is a different matter, and a CLOSED one
    // is a reported result.
    if (existing?.status === 'CLOSED') {
      console.log(`Рік ${YEAR} закрито. Reopen it before rebuilding it.`);
      process.exitCode = 1;
      return;
    }
    if (existing && replace) {
      const [acts, entries] = await Promise.all([
        prisma.activity.count({ where: { year: YEAR } }),
        prisma.ratingEntry.count({ where: { year: YEAR } }),
      ]);
      console.log(
        `--replace: dropping рік ${YEAR} — ${existing._count.activityTypes} показників, ` +
          `${acts} активностей, ${entries} рейтингів.`
      );
      if (apply) {
        await prisma.$transaction(
          async (tx) => {
            await tx.activity.deleteMany({ where: { year: YEAR } });
            await tx.ratingEntry.deleteMany({ where: { year: YEAR } });
            // Sections and activity types cascade off the template
            await tx.ratingTemplate.delete({ where: { year: YEAR } });
          },
          { timeout: 300_000 }
        );
      }
    }

    const divisions = await prisma.division.findMany({
      where: { registryKey: { not: null } },
      select: { id: true, registryKey: true, name: true },
    });
    const divisionByKey = new Map(divisions.map((d) => [d.registryKey!, d]));

    const sections = [...new Set(indicators.map((i) => i.section))].sort();
    console.log(`Рік ${YEAR}: ${indicators.length} показників, розділів ${sections.length}\n`);

    let unmatchedDivision = 0;
    const rows = indicators.map((i, order) => {
      const specs = specsFor(i);
      const key = i.enteredBy ? DIVISION_KEYS[i.enteredBy] : undefined;
      const division = key ? divisionByKey.get(key) : undefined;
      if (i.enteredBy && !division) unmatchedDivision += 1;
      return { indicator: i, specs, division, order };
    });

    for (const s of sections) {
      const mine = rows.filter((r) => r.indicator.section === s);
      console.log(`  розділ ${s}: ${mine.length}`);
      for (const r of mine.slice(0, 3)) {
        console.log(
          `    ${r.indicator.itemNumber.padEnd(5)} ${r.specs.kind.padEnd(7)} k=${String(r.specs.coefficient).padEnd(5)} ${r.indicator.label.slice(0, 46)}`
        );
      }
      if (mine.length > 3) console.log(`    …${mine.length - 3} more`);
    }

    const kinds = new Map<string, number>();
    for (const r of rows) kinds.set(r.specs.kind, (kinds.get(r.specs.kind) ?? 0) + 1);
    console.log(`\nscoring rules: ${[...kinds].map(([k, n]) => `${k} ${n}`).join(' · ')}`);
    console.log(
      `entered by a відділ: ${rows.filter((r) => r.division).length}` +
        (unmatchedDivision ? `  (${unmatchedDivision} named a відділ we could not match)` : '')
    );

    // The same contract the admin editor and the 2026 seed are held to.
    // `computeScore` throws on a rule whose fields do not match it, so an
    // indicator that fails here would be one nobody could ever submit against —
    // and we would only find out the day somebody tried.
    const broken = rows.flatMap((r) => {
      const problems = specProblems(r.specs.fields as never, { kind: r.specs.kind } as never);
      return problems.map(
        (p) => `  ${r.indicator.itemNumber} ${r.indicator.label.slice(0, 40)} — ${p}`
      );
    });
    if (broken.length > 0) {
      console.log(`\n${broken.length} indicators would be written in a state the engine refuses:`);
      for (const b of broken.slice(0, 10)) console.log(b);
      console.log('\nNothing written.');
      process.exitCode = 1;
      return;
    }
    console.log('every indicator passes specProblems');

    if (!apply) {
      console.log('\nNothing written. Re-run with --apply.');
      return;
    }

    await prisma.$transaction(
      async (tx) => {
        const template = await tx.ratingTemplate.create({
          data: {
            year: YEAR,
            name: `Рейтинг НПП ${YEAR}`,
            // Inactive: the app must not accept submissions against a year we
            // are importing. OPEN because closeYear writes the snapshots and
            // there is nothing yet to snapshot.
            isActive: false,
            status: 'OPEN',
          },
          select: { id: true },
        });

        const sectionIds = new Map<number, string>();
        for (const number of sections) {
          const created = await tx.ratingSection.create({
            data: {
              templateId: template.id,
              number,
              title: SECTION_TITLES[number] ?? `Розділ ${number}`,
            },
            select: { id: true },
          });
          sectionIds.set(number, created.id);
        }

        for (const r of rows) {
          await tx.activityType.create({
            data: {
              templateId: template.id,
              sectionId: sectionIds.get(r.indicator.section)!,
              order: r.order,
              code: codeFor(r.indicator),
              label: r.indicator.label,
              itemNumber: r.indicator.itemNumber,
              maxPerYear: null,
              coefficient: r.specs.coefficient,
              coefficientNote: r.indicator.unit,
              evidenceFields: r.specs.fields as unknown as Prisma.InputJsonValue,
              scoring: { kind: r.specs.kind } as unknown as Prisma.InputJsonValue,
              // Nothing closes a licence point until somebody says so in
              // /admin/rating/2025 — the picker exists for exactly this.
              licencePositions: [] as unknown as Prisma.InputJsonValue,
              inputSource: r.division ? 'DIVISION_MANAGED' : 'NPP_SUBMISSION',
              verifyingDivisionId: r.division?.id ?? null,
              isActive: true,
            },
          });
        }
      },
      { timeout: 120_000 }
    );

    console.log(`\nWritten. ${indicators.length} indicators under рік ${YEAR}.`);
    console.log('Next: link them to the Характеристика in /admin/rating/2025.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
