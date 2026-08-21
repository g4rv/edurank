import 'dotenv/config';
import { readdirSync, statSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import ExcelJS from 'exceljs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '../lib/generated/prisma/client';
import { parseTypeSpecs } from '../validations/activity-type-spec';
import { computeScore } from '../lib/rating/scoring';
import { byFullName, nameKey } from './rating-sheet-2025';

// Imports one year of activities out of the `Розділ_*` workbooks.
//
//   pnpm import:activities-2025            report only, writes nothing
//   pnpm import:activities-2025 --apply    writes them
//
// **Indicators are matched by item number, and by label where the two
// disagree.** The number is safe here in a way it would not have been before:
// both sides come from the SAME year's documents. But they are two documents,
// and the Розділ files number патенти 3.28 where the «Рейтинг» sheet the
// template was read from numbers it 3.29 — so a label that matches an indicator
// outright wins, and every disagreement is counted in the report.
//
// **Scores are the university's own** (owner, 2026-08-19). Each row is priced
// with 2025's coefficients through our own engine, so the arithmetic is ours
// but every input is theirs. `import-report/old-totals.md` is what it has to
// add up to.

const ROOT = 'edu-reference/ФАКУЛЬТЕТИ';
const OUT = 'import-report';
const YEAR = 2025;

function text(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return `${v.getUTCDate()}.${v.getUTCMonth() + 1}`;
  if (typeof v === 'object') {
    const o = v as { richText?: unknown[]; text?: unknown; result?: unknown };
    if (Array.isArray(o.richText)) return o.richText.map(text).join('');
    if (o.text !== undefined) return text(o.text);
    if (o.result !== undefined) return text(o.result);
    return '';
  }
  return String(v);
}
const tidy = (s: string) => s.replace(/\s+/g, ' ').trim();
const norm = (s: string) =>
  tidy(s)
    .toLowerCase()
    .replace(/^\d+\.\d+\.?\s*/, '')
    .replace(/[«»"'’`]/g, '')
    .replace(/[.,:;()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

interface RawRow {
  person: string;
  department: string;
  section: number;
  itemNumber: string | null;
  itemLabel: string;
  option: string;
  quantity: string;
  evidence: string;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    // `~$…` is Excel's lock file for an open workbook, not a workbook
    else if (p.includes('Розділ_') && p.endsWith('.xlsx') && !e.startsWith('~$')) out.push(p);
  }
  return out;
}

async function readRows(path: string, year: number): Promise<RawRow[]> {
  const parts = path.split(/[\\/]/);
  const person = (parts.at(-1) ?? '').replace(/\.xlsx$/, '');
  const section = Number((parts.at(-2) ?? '').replace('Розділ_', ''));
  const department = parts.at(-3) ?? '';

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const ws = wb.getWorksheet(String(year));
  if (!ws) return [];

  const rows: RawRow[] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const a = tidy(text(row.getCell(1).value));
    if (!a) return;
    rows.push({
      person,
      department,
      section,
      itemNumber: a.match(/^(\d+\.\d+)/)?.[1] ?? null,
      itemLabel: a,
      option: tidy(text(row.getCell(2).value)),
      quantity: tidy(text(row.getCell(3).value)),
      evidence: tidy(text(row.getCell(4).value)),
    });
  });
  return rows;
}

interface Choice {
  value: string;
  label: string;
  points?: number;
}

/**
 * Which choice a Розділ row means — and whether column 3 was its quantity.
 *
 * The old form did not record the choice in one place. Column 2 holds either
 * the choice itself («співавторство») or the TITLE OF ITS GROUP («Організація
 * та проведення Всеукраїнських наукових конференцій…»), and in the second case
 * the choice is identifiable only by its price in column 3, with the words
 * repeated inside the free-text evidence («Роль: член оргкомітету»).
 *
 * Matching column 2 alone put 399 conference rows, 251 ініціативна тематика
 * rows and 175 others on a group title, which the template import had minted as
 * an option worth one point. Соловйова's розділ 4 came out at 3 against the
 * sheet's 90 (2026-08-20).
 *
 * So column 3 has two meanings and they have to be told apart: it is the price
 * when it is what picked the choice, and the quantity when the row already
 * named one — 1.11 «дистанційно (не менше 1 місяця)» × 2 стажування = 20.
 */
function resolveOption(
  options: readonly Choice[],
  row: { option: string; quantity: string; evidence: string }
): { chosen: Choice; thirdIsPoints: boolean } | null {
  const said = norm(row.option);

  // 1. The row names the choice outright. Column 3 is then a quantity.
  const exact = options.find((o) => norm(o.label) === said);
  if (exact) return { chosen: exact, thirdIsPoints: false };

  // 2. It names the group. `legacy:template` writes «group — choice», so the
  //    group's own members are the labels that start with it.
  const group = said ? options.filter((o) => norm(o.label).startsWith(`${said} `)) : [];
  const pool = group.length > 0 ? group : options;

  // 3. The words are in the evidence text where the form put them, and they
  //    beat the price. Карпа Марта's second 4.1 row says «Роль: голова
  //    оргкомітету» and carries 50 in column 3, but a голова of a Міжнародна
  //    конференція is worth 100 — which is what her sheet awarded. Column 3 is
  //    not always the price, so where the row says the role in words, the words
  //    win and the row counts once.
  // No `` after the keyword: JavaScript defines a word boundary on
  // [A-Za-z0-9_], so it can never match after a Cyrillic letter — with one
  // there the alternation always fell through to `$` and swallowed the whole
  // cell, which is why this branch had never once fired.
  const role = /(?:Роль|Вид роботи|Посада)\s*:\s*(.+?)(?:\s+(?:Дата|Наказ|Назва|ПІБ|Місце)|$)/u
    .exec(row.evidence)?.[1]
    ?.trim();
  if (role) {
    const wanted = norm(role);
    const named = pool.filter((o) => norm(o.label).endsWith(wanted));
    if (named.length === 1) return { chosen: named[0], thirdIsPoints: true };
  }

  // 4. Failing that, the price names the choice — but only where it names ONE.
  const points = Number(row.quantity.replace(',', '.'));
  if (Number.isFinite(points)) {
    const byPoints = pool.filter((o) => o.points === points);
    if (byPoints.length === 1) return { chosen: byPoints[0], thirdIsPoints: true };
  }

  // 5. A row that names no option, on an indicator with only one, means that
  //    one — the sheet leaves it out when there is nothing to choose.
  if (options.length === 1) return { chosen: options[0], thirdIsPoints: false };
  return null;
}

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
    const byLabel = new Map(template.activityTypes.map((t) => [norm(t.label), t]));

    /**
     * One label is the opening of the other — the Розділ files write «…на
     * об'єкти інтелектуальної власності» where the template has «…власності за
     * поточний рік». The same indicator, one document trimmed.
     *
     * Only ever accepted when exactly ONE indicator matches. 3.13 and 3.14 open
     * with the same twelve words and differ at the end, so a first-wins prefix
     * would file somebody's всеукраїнський призер as an international one.
     */
    const labelled = template.activityTypes.map((t) => ({ key: norm(t.label), type: t }));
    const uniquePrefix = (label: string) => {
      if (label.length < 20) return undefined;
      const hits = labelled.filter((l) => l.key.startsWith(label) || label.startsWith(l.key));
      return hits.length === 1 ? hits[0].type : undefined;
    };

    const staff = await prisma.staff.findMany({
      select: { id: true, lastName: true, firstName: true, patronymic: true },
    });
    const byName = byFullName(staff);

    const files = walk(ROOT);
    const raw: RawRow[] = [];
    for (const f of files) raw.push(...(await readRows(f, YEAR)));
    console.log(`Розділ files ${files.length} · rows in ${YEAR}: ${raw.length}`);

    // ── A row that appears twice is imported twice, deliberately ──
    //
    // Шевчук Лариса Дмитрівна's Розділ_1 holds every one of her six rows a
    // second time — she filled the form twice — and three people have a whole
    // Розділ file saved again as «ПІБ(1).xlsx». Dropping the repeats is the
    // obvious thing to do and it is wrong: measured over all 250 people it
    // moved the year from 0.19% under the university's own total to 0.46%
    // under, and dropped the count of people matching exactly from 215 to 195.
    // Their pipeline counts a repeated submission, so ours has to.

    interface Ready {
      staffId: string;
      typeId: string;
      evidence: Record<string, unknown>;
      computedValue: number;
      score: number;
    }
    const ready: Ready[] = [];
    const noPerson = new Map<string, number>();
    const noIndicator = new Map<string, number>();
    const noOption = new Map<string, number>();
    /** Rows whose number and label name different indicators — the label wins */
    const renumbered = new Map<string, number>();
    const failed = new Map<string, number>();
    const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

    for (const r of raw) {
      const staffId = byName.get(nameKey(r.person))?.id;
      if (!staffId) {
        bump(noPerson, r.person);
        continue;
      }

      // Number first — it is this same year's own numbering, so it identifies
      // the indicator exactly. The label is the fallback for a row that lost it.
      //
      // **Unless the two disagree.** The Розділ files number патенти 3.28 and
      // the «Рейтинг» sheet the template came from numbers it 3.29 — so the
      // drift the docs warn about between years happens inside one year too,
      // between its own two documents. 60 patent rows were filed as citation
      // counts and then refused for naming an option that indicator has not
      // got. A label that matches an indicator outright is the stronger claim.
      const named = byLabel.get(norm(r.itemLabel)) ?? uniquePrefix(norm(r.itemLabel));
      const numbered = r.itemNumber ? byItem.get(r.itemNumber) : undefined;
      const type = named ?? numbered;
      if (named && numbered && named.id !== numbered.id) {
        bump(renumbered, `${r.itemNumber} → ${named.itemNumber} «${named.label.slice(0, 40)}»`);
      }
      if (!type) {
        bump(noIndicator, r.itemLabel.slice(0, 70));
        continue;
      }

      let specs;
      try {
        specs = parseTypeSpecs(type);
      } catch {
        bump(failed, `${type.itemNumber}: broken specs`);
        continue;
      }

      // The sheet names the choice in words; the field stores a value
      const evidence: Record<string, unknown> = { title: r.evidence || r.itemLabel };
      const select = specs.fields.find((f) => f.kind === 'select' && f.name === 'option');
      let thirdIsPoints = false;
      if (select && select.kind === 'select') {
        const found = resolveOption(select.options, r);
        if (!found) {
          bump(noOption, `${type.itemNumber} «${r.option.slice(0, 40)}» ×${r.quantity}`);
          continue;
        }
        evidence.option = found.chosen.value;
        thirdIsPoints = found.thirdIsPoints;
      }

      // Column 3 is a quantity — unless it was what identified the choice, and
      // then the row is a single occurrence priced by that choice.
      //
      // **A written zero is a zero.** Коцур Надія's eighth 3.10 article carries
      // 0 сторінок and her sheet scores it 0; read as «no quantity given» it
      // became 1 and paid her 10 points she was never awarded. The fallback to
      // one is for a cell that is EMPTY or unreadable, which is a different
      // thing from a cell that says none.
      const written = r.quantity.replace(',', '.').trim();
      const quantity = Number(written);
      const amount =
        thirdIsPoints || written === '' || !Number.isFinite(quantity) || quantity < 0
          ? 1
          : quantity;
      if (specs.fields.some((f) => f.name === 'value')) evidence.value = amount;
      if (specs.fields.some((f) => f.name === 'credits')) evidence.credits = amount;

      try {
        const { computedValue, score } = computeScore(
          {
            code: type.code,
            coefficient: type.coefficient,
            scoring: specs.scoring,
            evidenceFields: specs.fields,
          },
          evidence
        );
        ready.push({ staffId, typeId: type.id, evidence, computedValue, score });
      } catch (e) {
        bump(failed, `${type.itemNumber}: ${(e as Error).message.slice(0, 50)}`);
      }
    }

    const pct = (n: number) => `${Math.round((n / raw.length) * 100)}%`;
    console.log(`\nready to import  ${ready.length}  (${pct(ready.length)})`);
    const lost = [
      ['person not in the system', noPerson],
      ['indicator not in the 2025 template', noIndicator],
      ['option not recognised', noOption],
      ['number and label disagreed — filed by label', renumbered],
      ['scoring refused the row', failed],
    ] as const;
    for (const [what, m] of lost) {
      const n = [...m.values()].reduce((s, v) => s + v, 0);
      if (n > 0) console.log(`  ${what}: ${n} (${m.size} distinct)`);
    }

    const report = [
      `# ${YEAR} activities — what would be imported`,
      '',
      `Rows in the sheets: **${raw.length}** · ready: **${ready.length}** (${pct(ready.length)})`,
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
    writeFileSync(join(OUT, `activities-${YEAR}.md`), report, 'utf8');
    console.log(`  → ${OUT}/activities-${YEAR}.md`);

    if (!apply) {
      console.log('\nNothing written. Re-run with --apply.');
      return;
    }

    const already = await prisma.activity.count({ where: { year: YEAR } });
    if (already > 0) {
      console.log(`\n${already} activities already exist for ${YEAR}. Nothing written.`);
      return;
    }

    // createMany, then one recompute pass — the per-row upsert the app uses is
    // right for one submission and wrong for twenty thousand.
    await prisma.$transaction(
      async (tx) => {
        await tx.activity.createMany({
          data: ready.map((r) => ({
            staffId: r.staffId,
            activityTypeId: r.typeId,
            year: YEAR,
            evidence: r.evidence as Prisma.InputJsonValue,
            computedValue: r.computedValue,
            score: r.score,
            status: 'APPROVED' as const,
            submittedByRole: 'SYSTEM' as const,
            approvedAt: new Date(),
          })),
        });
      },
      { timeout: 300_000 }
    );

    console.log(`\nWritten: ${ready.length} activities for ${YEAR}.`);
    console.log('Next: recompute the RatingEntry rollups and check them against old-totals.md');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
