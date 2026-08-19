import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';
import ExcelJS from 'exceljs';
import { ACTIVITY_TYPES_2026 } from '../lib/rating/activity-types';

// Read-only survey of edu-reference/ФАКУЛЬТЕТИ — parses everything, writes
// nothing to the database, decides nothing.
//
// Its whole job is to answer the questions in docs/legacy-import.md with
// evidence instead of guesses: which people we have, which rows will not map,
// and whether the old per-indicator scores can be reconciled at all. The import
// itself is written afterwards, against what this finds.
//
//   pnpm legacy:report
//
// Output goes to import-report/ (gitignored — it is 318 real colleagues).

const ROOT = 'edu-reference/ФАКУЛЬТЕТИ';
const OUT = 'import-report';

// ── reading xlsx ────────────────────────────────────────────────────────────

function text(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    // Excel ate the item number: «3.5» parsed as d.m → 3 May. See
    // docs/legacy-import.md §2. Only x.1–x.12 are affected.
    return `${v.getUTCDate()}.${v.getUTCMonth() + 1}`;
  }
  if (typeof v === 'object') {
    // Recursed rather than returned: a hyperlink cell is `{ text, hyperlink }`
    // and its `text` is itself a rich-text object often enough to crash on.
    const o = v as { richText?: unknown[]; text?: unknown; result?: unknown };
    if (Array.isArray(o.richText)) return o.richText.map(text).join('');
    if (o.text !== undefined) return text(o.text);
    if (o.result !== undefined) return text(o.result);
    return '';
  }
  return String(v);
}

const tidy = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Lower-cased, punctuation-flattened — what two labels are compared on */
function normalise(s: string): string {
  return tidy(s)
    .toLowerCase()
    .replace(/^\d+\.\d+\.?\s*/, '') // strip a leading item number
    .replace(/[«»"'’`]/g, '')
    .replace(/[–—-]/g, '-')
    .replace(/[.,:;()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * «Прізвище Ім'я По-батькові» → a stable comparison key.
 *
 * Two things the file names do that the roster does not:
 *
 * - **`_` is a sanitised apostrophe.** Whatever exported these folders could not
 *   put `'` in a name, so `Дем'яненко` is on disk as `Дем_яненко` — and the
 *   факультет folder «Фізичної культури, спорту і здоров_я» says the same.
 * - **`(1)` is a duplicate file**, not part of anybody's name.
 *
 * Left uncorrected, both read as somebody who has left the university.
 */
const nameKey = (s: string) =>
  tidy(s)
    .toLowerCase()
    .replace(/\(\d+\)\s*$/, '')
    .replace(/[’`_]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

/** Plain edit distance, capped — only ever used to offer a human a suggestion */
function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const curr = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

/**
 * The roster name this one is probably a misspelling of, or null.
 *
 * A suggestion, never a match: «Мізін Констянтин» / «Мізін Костянтин» is one
 * letter and clearly the same person, but so is «Коцур Дмитро» / «Коцур Роман»
 * by surname alone, and those are two different people. Deciding is the
 * reviewer's job — this only puts the candidate next to the question.
 */
function closestRosterName(name: string, roster: { fullName: string }[]): string | null {
  const key = nameKey(name);
  let best: { name: string; d: number } | null = null;
  for (const r of roster) {
    const d = editDistance(key, nameKey(r.fullName));
    if (!best || d < best.d) best = { name: r.fullName, d };
  }
  // Three edits over a full ПІБ is a typo; more is a different person.
  return best && best.d <= 3 ? `${best.name}  _(різниця: ${best.d})_` : null;
}

// ── the 2026 catalogue, indexed for matching ────────────────────────────────

interface Indicator {
  code: string;
  itemNumber: string;
  label: string;
  section: number;
  inputSource: string;
}
const CATALOGUE = ACTIVITY_TYPES_2026 as unknown as Indicator[];
const byLabel = new Map<string, Indicator[]>();
for (const ind of CATALOGUE) {
  const k = normalise(ind.label);
  byLabel.set(k, [...(byLabel.get(k) ?? []), ind]);
}

/**
 * Label first, number second — deliberately.
 *
 * The 2025 sheets and the 2026 catalogue disagree about what 3.10 and 3.12
 * mean, so a number match alone would file publications as supervised
 * dissertations. A number is only accepted as corroboration of a label that
 * already matched, never on its own.
 */
type Match =
  | { kind: 'exact'; indicator: Indicator }
  | { kind: 'prefix'; indicator: Indicator }
  | { kind: 'none' };

function matchIndicator(rawLabel: string): Match {
  const label = normalise(rawLabel);
  if (!label) return { kind: 'none' };

  const exact = byLabel.get(label);
  if (exact?.length) return { kind: 'exact', indicator: exact[0] };

  // The sheets abbreviate: «Публікації у виданнях категорії Б» against the
  // catalogue's «Публікації у фахових наукових виданнях України категорії Б».
  // One containing the other is strong; anything looser is a guess and is
  // reported as unmapped so a person decides.
  const candidates = CATALOGUE.filter((ind) => {
    const c = normalise(ind.label);
    return c.startsWith(label) || label.startsWith(c);
  });
  if (candidates.length === 1) return { kind: 'prefix', indicator: candidates[0] };

  return { kind: 'none' };
}

// ── walking the folder ──────────────────────────────────────────────────────

interface ActivityRow {
  faculty: string;
  department: string;
  person: string;
  section: number;
  year: number;
  itemLabel: string;
  option: string;
  quantity: string;
  evidence: string;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.xlsx')) out.push(p);
  }
  return out;
}

async function readSectionFile(path: string): Promise<ActivityRow[]> {
  // Counted from the END: .../<факультет>/<кафедра>/Розділ_N/<ПІБ>.xlsx, so the
  // depth of the root does not matter and moving the folder cannot silently
  // shift every field by one.
  const parts = path.split(/[\\/]/);
  const person = (parts.at(-1) ?? '').replace(/\.xlsx$/, '');
  const section = Number((parts.at(-2) ?? '').replace('Розділ_', ''));
  const department = parts.at(-3) ?? '';
  const faculty = parts.at(-4) ?? '';

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const rows: ActivityRow[] = [];

  for (const ws of wb.worksheets) {
    const year = Number(ws.name);
    if (!Number.isInteger(year)) continue;
    ws.eachRow({ includeEmpty: false }, (row) => {
      const itemLabel = tidy(text(row.getCell(1).value));
      if (!itemLabel) return;
      rows.push({
        faculty,
        department,
        person,
        section,
        year,
        itemLabel,
        option: tidy(text(row.getCell(2).value)),
        quantity: tidy(text(row.getCell(3).value)),
        evidence: tidy(text(row.getCell(4).value)),
      });
    });
  }
  return rows;
}

/** «Рейтинг» / «Рейтинг_2024»: the per-indicator score the old system produced */
async function readRatingTotals(path: string) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const out: { sheet: string; year: number | null; total: number | null }[] = [];
  for (const ws of wb.worksheets) {
    if (!ws.name.startsWith('Рейтинг')) continue;
    let total: number | null = null;
    let year: number | null = null;
    ws.eachRow({ includeEmpty: false }, (row) => {
      const a = tidy(text(row.getCell(1).value));
      if (a.startsWith('Загальна сума балів')) {
        const v = Number(text(row.getCell(5).value));
        if (Number.isFinite(v)) total = v;
      }
      if (!year) {
        const y = Number(text(row.getCell(5).value));
        if (Number.isInteger(y) && y > 2015 && y < 2100) year = y;
      }
    });
    out.push({ sheet: ws.name, year, total });
  }
  return out;
}

// ── main ────────────────────────────────────────────────────────────────────

async function main() {
  mkdirSync(OUT, { recursive: true });

  const roster = JSON.parse(readFileSync('staff-roster.json', 'utf8')) as {
    fullName: string;
    email: string;
    department: string;
  }[];
  const rosterByName = new Map(roster.map((r) => [nameKey(r.fullName), r]));

  const all = walk(ROOT);
  const sectionFiles = all.filter((f) => f.includes('Розділ_'));
  const tableFiles = all.filter((f) => f.includes('Таблиці_Викладачів'));

  console.log(`Розділ files      ${sectionFiles.length}`);
  console.log(`Таблиці files     ${tableFiles.length}`);
  console.log(`roster entries    ${roster.length}\n`);

  // ── activities ──
  const rows: ActivityRow[] = [];
  for (const f of sectionFiles) rows.push(...(await readSectionFile(f)));
  console.log(`activity rows     ${rows.length}`);

  const people = [...new Set(rows.map((r) => r.person))].sort();
  const known = people.filter((p) => rosterByName.has(nameKey(p)));
  const unknown = people.filter((p) => !rosterByName.has(nameKey(p)));

  console.log(`people in folders ${people.length}`);
  console.log(`  in roster       ${known.length}`);
  console.log(`  NOT in roster   ${unknown.length}   → ${OUT}/not-in-roster.md`);

  const byYear = new Map<number, number>();
  for (const r of rows) byYear.set(r.year, (byYear.get(r.year) ?? 0) + 1);
  console.log('\nrows per year');
  for (const [y, n] of [...byYear].sort()) console.log(`  ${y}  ${n}`);

  // ── mapping ──
  const unmapped = new Map<string, ActivityRow[]>();
  const mapped = new Map<string, number>();
  let exact = 0;
  let prefix = 0;

  for (const r of rows) {
    const m = matchIndicator(r.itemLabel);
    if (m.kind === 'none') {
      const k = normalise(r.itemLabel) || '(порожньо)';
      unmapped.set(k, [...(unmapped.get(k) ?? []), r]);
      continue;
    }
    if (m.kind === 'exact') exact += 1;
    else prefix += 1;
    mapped.set(m.indicator.code, (mapped.get(m.indicator.code) ?? 0) + 1);
  }

  const unmappedCount = [...unmapped.values()].reduce((s, v) => s + v.length, 0);
  console.log('\nlabel → indicator');
  console.log(`  exact           ${exact}`);
  console.log(`  by prefix       ${prefix}`);
  console.log(`  UNMAPPED        ${unmappedCount}  (${unmapped.size} distinct labels)`);
  console.log(`                  → ${OUT}/unmapped.md`);

  // ── old totals, for reconciliation later ──
  const totals: string[] = [
    '| person | sheet | year | Загальна сума балів |',
    '| --- | --- | --- | --- |',
  ];
  for (const f of tableFiles) {
    const person = (f.split(/[\\/]/).pop() ?? '').replace(/\.xlsx$/, '');
    for (const t of await readRatingTotals(f)) {
      totals.push(`| ${person} | ${t.sheet} | ${t.year ?? '?'} | ${t.total ?? '—'} |`);
    }
  }

  // ── files ──
  writeFileSync(
    join(OUT, 'not-in-roster.md'),
    [
      '# In the folders, not in staff-roster.json',
      '',
      'These people have data in `edu-reference/ФАКУЛЬТЕТИ/` but no entry in the',
      'roster the app was seeded from. Most are likely to have left; some may just',
      'be spelled differently. **Decide each one before importing** — a name that is',
      'only a spelling difference would otherwise be imported as a second person.',
      '',
      `Folder people: ${people.length} · in roster: ${known.length} · here: ${unknown.length}`,
      '',
      '| # | ПІБ as the folder spells it | кафедра | rows | closest name in the roster |',
      '| --- | --- | --- | --- | --- |',
      ...unknown.map((p, i) => {
        const mine = rows.filter((r) => r.person === p);
        const near = closestRosterName(p, roster);
        return `| ${i + 1} | ${p} | ${mine[0]?.department ?? '—'} | ${mine.length} | ${near ?? '—'} |`;
      }),
      '',
    ].join('\n'),
    'utf8'
  );

  writeFileSync(
    join(OUT, 'unmapped.md'),
    [
      '# Rows whose indicator we could not identify',
      '',
      'Matched on the LABEL, never the item number — the 2025 sheets and the 2026',
      'catalogue disagree about what 3.10 and 3.12 mean (docs/legacy-import.md §1).',
      'Anything here needs a person to say which indicator it is, or to confirm it',
      'is not one at all.',
      '',
      `${unmappedCount} rows over ${unmapped.size} distinct labels.`,
      '',
      ...[...unmapped]
        .sort((a, b) => b[1].length - a[1].length)
        .flatMap(([, rowsFor]) => {
          const first = rowsFor[0];
          return [
            `## ${first.itemLabel}`,
            '',
            `${rowsFor.length} rows · розділ ${first.section} · years ${[...new Set(rowsFor.map((r) => r.year))].sort().join(', ')}`,
            '',
            '| кафедра | ПІБ | рік | опція | к-сть | підтвердження |',
            '| --- | --- | --- | --- | --- | --- |',
            ...rowsFor
              .slice(0, 8)
              .map(
                (r) =>
                  `| ${r.department.slice(0, 28)} | ${r.person} | ${r.year} | ${r.option.slice(0, 30)} | ${r.quantity} | ${r.evidence.slice(0, 60).replace(/\|/g, '/')} |`
              ),
            rowsFor.length > 8 ? `\n…and ${rowsFor.length - 8} more rows like it.` : '',
            '',
          ];
        }),
    ].join('\n'),
    'utf8'
  );

  writeFileSync(
    join(OUT, 'old-totals.md'),
    ['# «Загальна сума балів» as the old sheets report it', '', ...totals, ''].join('\n'),
    'utf8'
  );

  console.log(`\nwrote ${OUT}/not-in-roster.md, ${OUT}/unmapped.md, ${OUT}/old-totals.md`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
