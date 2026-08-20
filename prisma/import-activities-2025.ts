import 'dotenv/config';
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import ExcelJS from 'exceljs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '../lib/generated/prisma/client';
import { parseTypeSpecs } from '../validations/activity-type-spec';
import { computeScore } from '../lib/rating/scoring';

// Imports one year of activities out of the `Розділ_*` workbooks.
//
//   pnpm import:activities-2025            report only, writes nothing
//   pnpm import:activities-2025 --apply    writes them
//
// **Indicators are matched by item number**, which is safe here and would not
// have been before: both sides now come from the SAME year's document. The
// numbering only drifts BETWEEN years, and there is no crossing of years left
// to do — 2025's rows go into 2025's template.
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
/** `_` in a file name is a sanitised apostrophe; `(1)` is a duplicate file */
const nameKey = (s: string) =>
  tidy(s)
    .toLowerCase()
    .replace(/\(\d+\)\s*$/, '')
    .replace(/[’`_]/g, "'")
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
    else if (p.includes('Розділ_') && p.endsWith('.xlsx')) out.push(p);
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

    const roster = JSON.parse(readFileSync('staff-roster.json', 'utf8')) as {
      fullName: string;
      email: string;
    }[];
    const emailByName = new Map(roster.map((r) => [nameKey(r.fullName), r.email]));

    const staff = await prisma.staff.findMany({ select: { id: true, email: true } });
    const idByEmail = new Map(staff.map((s) => [s.email.toLowerCase(), s.id]));

    const files = walk(ROOT);
    const raw: RawRow[] = [];
    for (const f of files) raw.push(...(await readRows(f, YEAR)));
    console.log(`Розділ files ${files.length} · rows in ${YEAR}: ${raw.length}`);

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
    const failed = new Map<string, number>();
    const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

    for (const r of raw) {
      const email = emailByName.get(nameKey(r.person));
      const staffId = email ? idByEmail.get(email.toLowerCase()) : undefined;
      if (!staffId) {
        bump(noPerson, r.person);
        continue;
      }

      // Number first — it is this same year's own numbering, so it identifies
      // the indicator exactly. The label is the fallback for a row that lost it.
      const type = (r.itemNumber && byItem.get(r.itemNumber)) || byLabel.get(norm(r.itemLabel));
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
      if (select && select.kind === 'select') {
        const chosen =
          select.options.find((o) => norm(o.label) === norm(r.option)) ??
          // A row that names no option, on an indicator with only one, means
          // that one — the sheet leaves it out when there is nothing to choose.
          (select.options.length === 1 ? select.options[0] : undefined);
        if (!chosen) {
          bump(noOption, `${type.itemNumber} «${r.option.slice(0, 40)}»`);
          continue;
        }
        evidence.option = chosen.value;
      }

      const quantity = Number(r.quantity.replace(',', '.'));
      const amount = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
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
      ['person not on the roster', noPerson],
      ['indicator not in the 2025 template', noIndicator],
      ['option not recognised', noOption],
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
