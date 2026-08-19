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

interface SheetTotals {
  sheet: string;
  year: number | null;
  /** Section number → «Всього балів по розділу N» */
  sections: Record<number, number>;
  /** «Загальна сума балів» — the figure at the very bottom */
  total: number | null;
  /** п.38 positions with evidence text against them, out of 20 */
  positionsMet: number;
}

/**
 * The computed half of a person's workbook.
 *
 * This is the FALLBACK path, and it matters more than it looks: if the activity
 * rows cannot be mapped indicator by indicator, these five section totals and
 * the grand total are still enough to fill `RatingEntry` — and `RatingEntry` is
 * what `formulaShares` reads, so the ставки can be spread without a single
 * `Activity` row existing (owner, 2026-08-19).
 *
 * `Характеристика_РНПАВ` is counted for the same reason: `Кнпп` is «how many
 * people meet enough п.38 positions», and if the sheet already says who does,
 * that number survives even when nothing else imports.
 */
async function readWorkbookTotals(path: string): Promise<SheetTotals[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const out: SheetTotals[] = [];

  // п.38: column 3 carries the evidence; an empty cell is «not met», which is
  // an answer rather than missing data.
  let positionsMet = 0;
  const kh = wb.worksheets.find((w) => w.name.startsWith('Характеристика'));
  if (kh) {
    kh.eachRow({ includeEmpty: false }, (row) => {
      const n = Number(tidy(text(row.getCell(1).value)));
      if (!Number.isInteger(n) || n < 1 || n > 20) return;
      if (tidy(text(row.getCell(3).value))) positionsMet += 1;
    });
  }

  for (const ws of wb.worksheets) {
    if (!ws.name.startsWith('Рейтинг')) continue;
    let total: number | null = null;
    let year: number | null = null;
    const sections: Record<number, number> = {};

    ws.eachRow({ includeEmpty: false }, (row) => {
      const label = tidy(text(row.getCell(1).value));
      const value = Number(text(row.getCell(5).value));

      const section = label.match(/^Всього балів по розділу\s*(\d)/)?.[1];
      if (section && Number.isFinite(value)) sections[Number(section)] = value;
      if (label.startsWith('Загальна сума балів') && Number.isFinite(value)) total = value;

      // The year sits alone in column 5 of the title block, above the table
      if (year === null && Number.isInteger(value) && value > 2015 && value < 2100) {
        year = value;
      }
    });

    out.push({ sheet: ws.name, year, sections, total, positionsMet });
  }
  return out;
}

/**
 * Candidate indicators for a label we could not match, best first.
 *
 * Token overlap, not edit distance: «Публікації у виданнях категорії Б» and
 * «Публікації у фахових наукових виданнях України категорії Б» share almost
 * every word and differ by a third of their characters, so counting words finds
 * what counting letters misses.
 *
 * A suggestion for a person to accept, never a match. Every one of these is a
 * row that decides where somebody's article is filed.
 */
function candidatesFor(rawLabel: string, limit = 3): { indicator: Indicator; score: number }[] {
  // Length > 2, not > 3. «А» and «Б» are the ENTIRE difference between
  // publication_cat_a and publication_cat_b, and the longer filter dropped
  // them — which ranked «категорії А» first for a row plainly saying «Б».
  const tokens = (s: string) =>
    new Set(
      normalise(s)
        .split(' ')
        .filter((w) => w.length > 2)
    );
  const words = tokens(rawLabel);
  if (words.size === 0) return [];

  // The item number is worthless alone — the sheets and the catalogue disagree
  // about 3.10 and 3.12. As a TIEBREAK between labels that already score alike
  // it is fair corroboration, and small enough that it cannot outvote wording.
  const sheetNumber = rawLabel.match(/^(\d+\.\d+)/)?.[1];

  return CATALOGUE.map((indicator) => {
    const theirs = tokens(indicator.label);
    let shared = 0;
    for (const w of words) if (theirs.has(w)) shared += 1;
    // Divided by the smaller set, so a short sheet label matching a long
    // catalogue one still scores high — which is the usual shape here.
    const overlap = shared / Math.min(words.size, theirs.size || 1);
    return { indicator, score: overlap + (indicator.itemNumber === sheetNumber ? 0.05 : 0) };
  })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// ── УГСП_Дані.xlsx — the profile half ───────────────────────────────────────

/**
 * The university's own staff sheet, and the one file that fills a `Staff` row.
 *
 * Its «НПП» sheet carries стаж, звання, ступінь, the four research-profile
 * links with their citation counts, and ORCID — which is exactly the input to
 * every `PROFILE_DERIVED` indicator (1.1 стаж, 1.2 звання, 1.3 ступінь, 3.24
 * цитування). Without it those indicators score nothing however well the
 * activities import.
 *
 * Restricted to people in `staff-roster.json`, per the owner: the sheet lists
 * 317 people and the roster is the definition of who works here now.
 */
const RANKS: Record<string, string> = {
  професор: 'PROFESSOR',
  доцент: 'DOCENT',
  'старший викладач': 'SENIOR_LECTURER',
  викладач: 'LECTURER',
};

/**
 * «…за спеціальністю кафедри» is not a fifth degree — it is the degree PLUS
 * `degreeMatchesDepartment`, which is a separate boolean on Staff and worth
 * 10 points more in indicator 1.3.
 */
function parseDegree(raw: string): { degree: string | null; matches: boolean } {
  const s = raw.toLowerCase();
  const matches = s.includes('за спеціальністю кафедри');
  if (s.startsWith('доктор наук')) return { degree: 'DOCTOR', matches };
  if (s.startsWith('кандидат наук')) return { degree: 'CANDIDATE', matches };
  return { degree: null, matches: false };
}

async function reportProfiles(rosterByName: Map<string, { fullName: string; email: string }>) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('edu-reference/УГСП_Дані.xlsx');

  const lines: string[] = [
    '| ПІБ | our email | стаж | звання | ступінь | за спец. | ORCID | GS | Scopus | WoS |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ];
  const filled = new Map<string, number>();
  const bump = (k: string, v: unknown) => {
    if (v !== null && v !== undefined && v !== '') filled.set(k, (filled.get(k) ?? 0) + 1);
  };
  let listed = 0;
  let ours = 0;
  const unknownRank = new Set<string>();
  const unknownDegree = new Set<string>();

  wb.getWorksheet('НПП')?.eachRow({ includeEmpty: false }, (row, n) => {
    if (n === 1) return;
    const name = tidy(text(row.getCell(2).value));
    if (!name) return;
    listed += 1;

    const mine = rosterByName.get(nameKey(name));
    if (!mine) return; // not on the current roster — the owner's rule
    ours += 1;

    const rankRaw = tidy(text(row.getCell(6).value));
    const degreeRaw = tidy(text(row.getCell(7).value));
    const rank = RANKS[rankRaw.toLowerCase()] ?? null;
    const { degree, matches } = parseDegree(degreeRaw);
    if (rankRaw && !rank) unknownRank.add(rankRaw);
    if (degreeRaw && !degree) unknownDegree.add(degreeRaw);

    const experience = tidy(text(row.getCell(5).value));
    const orcid = tidy(text(row.getCell(17).value));
    const gs = tidy(text(row.getCell(16).value));
    const scopus = tidy(text(row.getCell(14).value));
    const wos = tidy(text(row.getCell(12).value));

    bump('pedagogicalExperience', experience);
    bump('academicRank', rank);
    bump('scientificDegree', degree);
    bump('orcidId', orcid);
    bump('googleScholarUrl', gs);
    bump('scopusUrl', scopus);
    bump('wosUrl', wos);
    bump('employmentRate', tidy(text(row.getCell(4).value)));

    const yn = (s: string) => (s ? '✓' : '—');
    lines.push(
      `| ${name} | ${mine.email} | ${experience || '—'} | ${rank ?? '—'} | ${degree ?? '—'} | ` +
        `${matches ? 'так' : '—'} | ${yn(orcid)} | ${yn(gs)} | ${yn(scopus)} | ${yn(wos)} |`
    );
  });

  console.log('\nУГСП_Дані «НПП» — the profile half');
  console.log(`  listed            ${listed}`);
  console.log(`  on our roster     ${ours}`);
  for (const [k, v] of [...filled].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${k.padEnd(22)} ${String(v).padStart(3)}  ${Math.round((v / ours) * 100)}%`);
  }
  if (unknownRank.size) console.log(`  ! unmapped звання: ${[...unknownRank].join(', ')}`);
  if (unknownDegree.size) console.log(`  ! unmapped ступінь: ${[...unknownDegree].join(', ')}`);

  // Who leads what — Department.headId and Faculty.deanId
  const heads: string[] = ['| кафедра | завідувач | on our roster |', '| --- | --- | --- |'];
  wb.getWorksheet('Кафедри')?.eachRow({ includeEmpty: false }, (row, n) => {
    if (n === 1) return;
    const dept = tidy(text(row.getCell(1).value));
    const head = tidy(text(row.getCell(2).value));
    if (!dept || !head) return;
    heads.push(`| ${dept} | ${head} | ${rosterByName.has(nameKey(head)) ? 'так' : '**ні**'} |`);
  });

  writeFileSync(
    join(OUT, 'profiles.md'),
    [
      '# Profile data from УГСП_Дані.xlsx, for people on the roster',
      '',
      'The «НПП» sheet fills the `Staff` columns that every `PROFILE_DERIVED`',
      'indicator reads — стаж, звання, ступінь, citations. Without it those',
      'indicators score nothing no matter how well the activities import.',
      '',
      `Listed in the sheet: ${listed} · on our roster: **${ours}** · the rest are skipped.`,
      '',
      '«за спец.» is `degreeMatchesDepartment` — the sheet folds it into the degree',
      'text and it is worth 10 more points in indicator 1.3.',
      '',
      ...lines,
      '',
      '## Хто завідує кафедрою',
      '',
      'For `Department.headId`. A «ні» is somebody who leads a кафедра but is not on',
      'the roster we seeded — worth checking before the import assigns nobody.',
      '',
      ...heads,
      '',
    ].join('\n'),
    'utf8'
  );
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

  // ── the computed half: totals and п.38, the fallback import path ──
  const totals: string[] = [
    '| person | in roster | year | р.1 | р.2 | р.3 | р.4 | р.5 | Загальна сума | п.38 з 20 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ];
  const yearsSeen = new Map<number, number>();
  const seenPeople = new Set<string>();
  let withTotal = 0;
  let khCovered = 0;

  for (const f of tableFiles) {
    const person = (f.split(/[\\/]/).pop() ?? '').replace(/\.xlsx$/, '');
    const inRoster = rosterByName.has(nameKey(person));
    for (const t of await readWorkbookTotals(f)) {
      const s = t.sections;
      totals.push(
        `| ${person} | ${inRoster ? 'так' : '**ні**'} | ${t.year ?? '?'} | ` +
          `${s[1] ?? '—'} | ${s[2] ?? '—'} | ${s[3] ?? '—'} | ${s[4] ?? '—'} | ${s[5] ?? '—'} | ` +
          `**${t.total ?? '—'}** | ${t.positionsMet} |`
      );
      if (t.total !== null) withTotal += 1;
      if (t.year) yearsSeen.set(t.year, (yearsSeen.get(t.year) ?? 0) + 1);
      if (!seenPeople.has(person)) {
        seenPeople.add(person);
        if (t.positionsMet > 0) khCovered += 1;
      }
    }
  }

  console.log('\nthe fallback path — the university’s own computed figures');
  console.log(`  sheets carrying a grand total  ${withTotal}`);
  console.log(`  people with any п.38 filled    ${khCovered} of ${seenPeople.size}`);
  console.log('  totals exist for year:');
  for (const [y, n] of [...yearsSeen].sort()) console.log(`    ${y}   ${n} sheets`);

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

  // ── the decision sheet: one row per label, candidates offered ──
  //
  // 2025 first and counted separately, because it is the year that matters
  // most: with every 2025 row mapped, the totals are computed from real
  // activities and `closeYear` has something to re-add. The trap only exists
  // while a RatingEntry stands on nothing.
  const decisions: string[] = [];
  const ranked = [...unmapped].sort((a, b) => b[1].length - a[1].length);
  const in2025 = (rowsFor: ActivityRow[]) => rowsFor.filter((r) => r.year === 2025).length;
  const labels2025 = ranked.filter(([, r]) => in2025(r) > 0);

  for (const [, rowsFor] of ranked) {
    const first = rowsFor[0];
    const cands = candidatesFor(first.itemLabel);
    const years = [...new Set(rowsFor.map((r) => r.year))].sort();
    decisions.push(
      `### ${first.itemLabel}`,
      '',
      `**${rowsFor.length} rows**${in2025(rowsFor) ? ` · **${in2025(rowsFor)} of them in 2025**` : ''} · розділ ${first.section} · роки ${years.join(', ')}`,
      '',
      'Options seen in column 2: ' +
        ([...new Set(rowsFor.map((r) => r.option).filter(Boolean))].slice(0, 6).join(' · ') ||
          '_(none — the row carries no option)_'),
      '',
      '| | 2026 indicator | item | code |',
      '| --- | --- | --- | --- |',
      ...cands.map(
        (c, i) =>
          `| ${i === 0 ? '**?**' : ' '} | ${c.indicator.label.slice(0, 60)} | ${c.indicator.itemNumber} | \`${c.indicator.code}\` |`
      ),
      cands.length ? '' : '_No candidate found — this may not be an indicator we carry._\n',
      '**Рішення:** `____________`  (code, or `SKIP`)',
      '',
      '---',
      ''
    );
  }

  writeFileSync(
    join(OUT, 'mapping-decisions.md'),
    [
      '# Which 2026 indicator is each of these?',
      '',
      'Every label below failed to match automatically, and each one decides where',
      'real work gets filed — the sheets and our catalogue disagree about what 3.10',
      'and 3.12 mean, so the number cannot be trusted and a fuzzy match that is',
      'wrong files an article as a supervised dissertation.',
      '',
      `**${labels2025.length} of these ${ranked.length} labels appear in 2025.** Deciding just those`,
      'takes 2025 to 100% mapped — which means its totals come from real activity',
      'rows, and `closeYear` can never zero them.',
      '',
      'Candidates are ranked by shared words. **?** marks the best guess, which is a',
      'suggestion and nothing more. Write the `code` on the Рішення line, or `SKIP`.',
      '',
      '---',
      '',
      ...decisions,
    ].join('\n'),
    'utf8'
  );

  console.log(
    `\ndecisions needed    ${ranked.length} labels (${labels2025.length} of them in 2025)`
  );
  console.log(`                    → ${OUT}/mapping-decisions.md`);

  await reportProfiles(rosterByName);

  console.log(
    `\nwrote ${OUT}/not-in-roster.md, ${OUT}/unmapped.md, ${OUT}/old-totals.md, ${OUT}/profiles.md`
  );
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
