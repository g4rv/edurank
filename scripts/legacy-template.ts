import { mkdirSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';
import ExcelJS from 'exceljs';

// Reads the 2025 rating template out of the university's own «Рейтинг» sheet.
//
// Every one of the 319 per-person workbooks carries the SAME blank table — all
// ~67 indicators of that year, with their numbers, wording, coefficients and
// who enters them — and then that person's scores against it. So the template
// is already written down; it just has to be lifted out.
//
// **Nothing is mapped to 2026.** A year owns its structure (CLAUDE.md), so the
// 2025 template gets 2025's own names and 2025's own coefficients, including
// indicators 2026 dropped. That is what makes the 13 unmapped labels stop being
// a problem: they are simply 2025 indicators.
//
//   pnpm legacy:template
//
// Writes nothing to the database. Output is import-report/template-2025.md,
// for a person to read before any of it lands.

const ROOT = 'edu-reference/ФАКУЛЬТЕТИ';
const OUT = 'import-report';

function text(v: unknown): string {
  if (v === null || v === undefined) return '';
  // Excel ate «3.5» as a date, d.m — see docs/legacy-import.md
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

/** One choice under an indicator — «доцент — 30», «співавторство — 150» */
interface Option {
  label: string;
  points: number | null;
}

interface Indicator {
  section: number;
  itemNumber: string;
  label: string;
  /** Column 3 on the indicator's own row. Null when the points live on options. */
  coefficient: number | null;
  /** Column 4 — «бал за рік», «балів* др.а./с.а.» */
  unit: string | null;
  /** Column 6 — «ННВ», «ННЦЗЯО»… blank means the НПП submits it */
  enteredBy: string | null;
  options: Option[];
}

/**
 * What a set of choices are all called — «Видання монографії» out of
 * «Видання монографії (українською мовою)» and «… (мовою країн ЄС)».
 *
 * Whole words only, so a shared prefix cannot cut one in half, and trailing
 * punctuation is dropped. Returns '' when they share nothing useful, and the
 * caller then keeps the first label rather than inventing a name.
 */
function commonName(labels: string[]): string {
  if (labels.length === 0) return '';
  const words = labels.map((l) => l.split(' '));
  const first = words[0];
  let n = 0;
  while (n < first.length && words.every((w) => w[n] === first[n])) n += 1;
  return first
    .slice(0, n)
    .join(' ')
    .replace(/[\s(,:;-]+$/, '')
    .trim();
}

/**
 * The unit is not always on the indicator's own row.
 *
 * 2.2 «Видання затверджені вченою радою» and 1.11 «Підвищення кваліфікації»
 * are headings with nothing in column 4; «балів* др.а./с.а.» and «балів
 * кредит 10» sit on the CHOICES underneath. Reading only the top row made both
 * a flat SELECT, so a textbook of six друкованих аркушів scored one textbook
 * and two months of стажування scored one — 4 300 points short over 54 people.
 *
 * The first unit under an indicator wins. Where the choices differ («балів
 * кредит 10» beside «балів кредит 50») they differ in the price, which lives on
 * the option, not in the unit.
 */
function adoptUnit(indicator: Indicator, unit: string): void {
  if (!indicator.unit && unit) indicator.unit = unit;
}

async function extract(path: string): Promise<Indicator[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const ws = wb.getWorksheet('Рейтинг');
  if (!ws) return [];

  const out: Indicator[] = [];
  let section = 0;
  let current: Indicator | null = null;

  ws.eachRow({ includeEmpty: false }, (row) => {
    const a = tidy(text(row.getCell(1).value));
    const label = tidy(text(row.getCell(2).value));
    const third = tidy(text(row.getCell(3).value));
    const unit = tidy(text(row.getCell(4).value));
    const who = tidy(text(row.getCell(6).value));

    // «Всього балів по розділу 3», «Загальна сума балів» — the sheet's own sums
    if (/^(Всього балів|Загальна сума)/.test(a)) {
      current = null;
      return;
    }

    // A section header: the розділ number in column 1, its title in column 2.
    // The dot is optional — розділи 1–4 are written «1.» and розділ 5 is «5»,
    // and insisting on it dropped розділ 5 out of the template altogether.
    const sectionHeader = a.match(/^(\d)\.?$/);
    if (sectionHeader) {
      section = Number(sectionHeader[1]);
      current = null;
      return;
    }

    const points = third === '' ? null : Number(third.replace(',', '.'));
    const scored = points === null || Number.isNaN(points) ? null : points;

    // An indicator: «3.12» in column 1.
    //
    // **The number is MERGED down its options.** «1.2 Вчене звання» and its four
    // ranks all carry «1.2» in column 1, so a new indicator starts when the
    // number CHANGES, not whenever a number appears. Reading every numbered row
    // as an indicator turned 67 into 151 and swallowed розділ 5 whole.
    const item = a.match(/^(\d+\.\d+)\.?$/);
    if (item) {
      if (section === 0) return;

      if (current && current.itemNumber === item[1]) {
        // Same number as the row above — this is one of its choices
        if (label) current.options.push({ label, points: scored });
        adoptUnit(current, unit);
        return;
      }

      current = {
        section,
        itemNumber: item[1],
        label,
        coefficient: scored,
        unit: unit || null,
        enteredBy: who || null,
        options: [],
      };
      out.push(current);
      return;
    }

    // No number at all, text in column 2: also a choice — some rows drop the
    // merged number instead of repeating it.
    if (!a && label && current) {
      current.options.push({ label, points: scored });
      adoptUnit(current, unit);
    }
  });

  // ── Is the indicator's own row a heading, or already a choice? ──
  //
  // Most groups open with a heading and no points — «Вчене звання:» then
  // професор / доцент / … But some have no heading at all: 3.7 is two priced
  // rows, «Видання монографії (українською мовою)» 150 and «(мовою країн
  // Європейського союзу)» 250. Reading the first as the heading made the
  // Ukrainian edition the indicator's NAME and left the year with a monograph
  // indicator that only knew about the European one.
  //
  // So: a first row that carries points is itself a choice, and the indicator
  // is named by what its choices have in common.
  //
  // **Except a «1».** That is the sheet's placeholder in the criteria column on
  // a heading row, not a price. Treating it as a choice minted an option worth
  // one point on 14 indicators — and because the Розділ files write the group's
  // TITLE into their «option» column, the import then matched that option for
  // every such row. 399 conference-organiser rows scored 1 instead of 20–100,
  // and 4.1 came out at 3 points against the sheet's 90 (2026-08-20). Every
  // genuine first choice in the document is priced 10–500; every «1» is a title.
  for (const i of out) {
    if (i.options.length === 0) continue;

    const ownRowIsChoice = i.coefficient !== null && i.coefficient !== 1;
    if (ownRowIsChoice) {
      i.options.unshift({ label: i.label, points: i.coefficient });
      i.label = commonName(i.options.map((o) => o.label)) || i.label;
    }
    i.coefficient = null;

    // ── Two groups under one number ──
    //
    // 4.1 organises Міжнародні conferences and Всеукраїнські ones, each with
    // the same three roles at different prices: «член оргкомітету» is 50 in the
    // first group and 20 in the second. Left flat, the two are one label twice
    // and whichever comes first answers for both. The group title is folded in
    // — but only where there is more than one, so «одноосібно» under 3.9 is not
    // dressed up in the indicator's own name.
    const groups: { title: string; options: Option[] }[] = [
      { title: ownRowIsChoice ? '' : i.label.replace(/[\s:]+$/, ''), options: [] },
    ];
    for (const o of i.options) {
      if (o.points === 1) {
        groups.push({ title: o.label.replace(/[\s:]+$/, ''), options: [] });
        continue;
      }
      groups[groups.length - 1].options.push(o);
    }

    const filled = groups.filter((g) => g.options.length > 0);
    i.options = filled.flatMap((g) =>
      g.options.map((o) => ({
        label: filled.length > 1 && g.title ? `${g.title} — ${o.label}` : o.label,
        points: o.points,
      }))
    );
  }

  return out;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    // `~$…` is Excel's lock file for a workbook somebody has open. It is not a
    // workbook and exceljs dies on it with «is this a zip file?», which reads
    // like corrupt data rather than «close the spreadsheet».
    else if (p.includes('Таблиці_Викладачів') && p.endsWith('.xlsx') && !entry.startsWith('~$'))
      out.push(p);
  }
  return out;
}

/**
 * Has anybody actually filled this workbook in?
 *
 * A blank one has every «Всього балів по розділу N» and «Загальна сума балів»
 * empty. 30 of the 319 are like this — untouched forms — and they must never be
 * a source of scores, or 30 people import as zero.
 */
async function hasScores(path: string): Promise<boolean> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const ws = wb.getWorksheet('Рейтинг');
  if (!ws) return false;
  let found = false;
  ws.eachRow({ includeEmpty: false }, (row) => {
    const a = tidy(text(row.getCell(1).value));
    if (!/^(Всього балів|Загальна сума)/.test(a)) return;
    for (const col of [4, 5]) {
      const v = Number(tidy(text(row.getCell(col).value)));
      if (Number.isFinite(v) && v !== 0) found = true;
    }
  });
  return found;
}

/** A template reduced to what must be identical between two workbooks */
const shapeOf = (t: Indicator[]) =>
  t.map((i) => `${i.itemNumber}|${i.label}|${i.coefficient ?? ''}|${i.options.length}`).join('\n');

async function main() {
  mkdirSync(OUT, { recursive: true });
  const files = walk(ROOT);
  if (files.length === 0) throw new Error(`no workbooks under ${ROOT}`);

  console.log(`workbooks: ${files.length}`);
  const first = await extract(files[0]);
  console.log(`indicators in the first workbook: ${first.length}`);

  // Every workbook should carry the same blank table. Where they differ, the
  // difference is the interesting thing — a кафедра editing its own copy would
  // mean there is no single 2025 template to build.
  const shapes = new Map<string, string[]>();
  for (const f of files) {
    const key = shapeOf(await extract(f));
    shapes.set(key, [...(shapes.get(key) ?? []), f]);
  }

  const variants = [...shapes].sort((a, b) => b[1].length - a[1].length);
  console.log(`\ndistinct templates across all workbooks: ${variants.length}`);
  for (const [, group] of variants.slice(0, 5)) {
    console.log(`  ×${group.length}  e.g. ${group[0].split(/[\\/]/).slice(-3).join('/')}`);
  }

  // The FULLEST reading wins, not the most common one — and it turns out the
  // fullest reading is a BLANK form.
  //
  // 30 of the 319 workbooks carry no scores whatever: every «Всього балів по
  // розділу N» and «Загальна сума балів» is empty. They are the untouched
  // template. That is why they are the better source for it — nobody has merged
  // a cell over «3.13» and «3.14» while filling them in, so those two
  // indicators still carry their own numbers instead of folding into 3.12.
  //
  // The consequence for the import is the important half: the TEMPLATE comes
  // from a blank form, the SCORES come from the filled ones, and the two groups
  // do not even put the score in the same column (5 when filled, shifted when
  // blank). Reading scores out of a blank workbook would silently import zeros
  // for 30 people.
  const withCounts = await Promise.all(
    variants.map(async ([, group]) => ({ group, template: await extract(group[0]) }))
  );
  withCounts.sort(
    (a, b) => b.template.length - a.template.length || b.group.length - a.group.length
  );
  const skeleton = withCounts[0].template;

  const filled: string[] = [];
  const blank: string[] = [];
  for (const f of files) ((await hasScores(f)) ? filled : blank).push(f);
  console.log(`\nworkbooks with scores: ${filled.length} · blank: ${blank.length}`);
  if (blank.length) {
    console.log('  blank ones are the template, never a source of scores:');
    for (const f of blank.slice(0, 3)) console.log(`    ${f.split(/[\\/]/).slice(-1)[0]}`);
    if (blank.length > 3) console.log(`    …and ${blank.length - 3} more`);
  }

  // Structure from the blank form, UNITS from a filled one.
  //
  // «Критерії (балів)» spans two columns, and what sits in the second differs
  // between the two: a filled workbook says «бал за рік», a blank one holds a
  // stray number left over from whoever last opened it. Reading units off the
  // blank form gave 1.1 a note of «8» and found exactly one MULT indicator in
  // the whole year — the multiplying ones are recognised BY that text.
  //
  // So each half comes from the copy that has it right, joined on the item
  // number. An indicator the filled copies do not number — 3.13, 3.14 — simply
  // keeps no unit, which is true: there is nowhere to read one from.
  const fromFilled = filled.length ? await extract(filled[0]) : [];
  const unitByItem = new Map(fromFilled.map((i) => [i.itemNumber, i.unit]));
  const canonical = skeleton.map((i) => ({
    ...i,
    unit: unitByItem.get(i.itemNumber) ?? null,
  }));
  console.log(
    `\nfullest reading: ${canonical.length} indicators, from a group of ${withCounts[0].group.length} workbooks`
  );

  const bySection = new Map<number, Indicator[]>();
  for (const i of canonical) bySection.set(i.section, [...(bySection.get(i.section) ?? []), i]);

  console.log('\nthe most common template, by розділ:');
  for (const [s, list] of [...bySection].sort()) console.log(`  розділ ${s}: ${list.length}`);
  console.log(`  total: ${canonical.length}`);

  const lines: string[] = [
    '# The 2025 rating template, lifted from the university’s own sheets',
    '',
    'Read out of the «Рейтинг» sheet, which every one of the 319 workbooks',
    'carries identically. **Nothing here is mapped to 2026** — a year owns its',
    'structure, so 2025 keeps its own numbering, its own wording and its own',
    'coefficients, including the indicators 2026 dropped.',
    '',
    `Workbooks read: ${files.length} · distinct templates found: **${variants.length}**`,
    '',
    `**${filled.length} workbooks carry scores. ${blank.length} are blank forms** — untouched, and`,
    'the reason the template below is complete: nobody merged a cell over «3.13» and',
    '«3.14» while filling them in. They must never be read for scores.',
    '',
    'Nothing has been written to the database. This is for reading first.',
    '',
  ];

  if (variants.length > 1) {
    lines.push(
      '## ⚠️ The workbooks do not all agree',
      '',
      'More than one shape was found, so there is no single 2025 template until',
      'somebody says which is right. Groups, largest first:',
      '',
      ...variants.map(
        ([, group], n) =>
          `${n + 1}. **${group.length} workbooks** — e.g. \`${group[0].split(/[\\/]/).slice(-3).join('/')}\``
      ),
      ''
    );
  }

  for (const [s, list] of [...bySection].sort()) {
    lines.push(`## Розділ ${s} — ${list.length} показників`, '');
    lines.push('| № | Показник | Бали | Одиниця | Вносить |', '| --- | --- | --- | --- | --- |');
    for (const i of list) {
      lines.push(
        `| ${i.itemNumber} | ${i.label.slice(0, 70)} | ${i.coefficient ?? '—'} | ${i.unit ?? '—'} | ${i.enteredBy ?? 'НПП'} |`
      );
      for (const o of i.options) {
        lines.push(`| | &nbsp;&nbsp;↳ ${o.label.slice(0, 62)} | ${o.points ?? '—'} | | |`);
      }
    }
    lines.push('');
  }

  writeFileSync(join(OUT, 'template-2025.md'), lines.join('\n'), 'utf8');
  writeFileSync(join(OUT, 'template-2025.json'), JSON.stringify(canonical, null, 2), 'utf8');
  console.log(`\nwrote ${OUT}/template-2025.md and .json — nothing touched the database`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
