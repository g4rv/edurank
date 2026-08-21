import 'dotenv/config';
import { readdirSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import ExcelJS from 'exceljs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '../lib/generated/prisma/client';
import { parseTypeSpecs } from '../validations/activity-type-spec';
import { computeScore } from '../lib/rating/scoring';
import {
  byFullName,
  itemTotals,
  nameKey,
  readSheet,
  resolvePerson,
  same,
  workbooks,
} from './rating-sheet-2025';

// The відділи' own registers — the source behind розділи 1 and 2.
//
//   pnpm import:registers-2025            report only, writes nothing
//   pnpm import:registers-2025 --apply    writes them
//
// Run AFTER `pnpm import:activities-2025 --apply`, INSTEAD of
// `pnpm import:division-2025` — which reverse-engineered the same indicators
// out of the «Рейтинг» sheet and could not always tell голова from член.
//
// `edu-reference/Дані *.xlsx` are to the division half what the `Розділ_*`
// files are to the self-reported half: the record people actually keep. The
// «Рейтинг» sheet is a computed view of BOTH, which is why it carries the
// totals and not the reasons.
//
// What that buys, beyond being right: Сіропол's 1600 points under 3.17 are 16
// rows of «ДФ 27.053.012 — заступник, відповідальний секретар, вчений
// секретар», not a number that divides two ways. The «Рейтинг» sheet records
// only the 1600, and 1600 is заступник × 16 and член ради × 32 equally well.
//
// **Every score is still checked against the «Рейтинг» sheet** afterwards, by
// `pnpm import:verify-2025`. The register says what happened; their sheet says
// what it came to; the two have to agree.
//
// **2025 only** (owner, 2026-08-20). Дані ННВ and Дані ВМіжнароднихЗ have a tab
// per year, but «Спеціалізовані вчені ради» and the ННЦЗЯО registers have no
// year at all — they are this year's state. The ННЦЗЯО rows carrying «Рік
// акредитації 2026» are next year's and are skipped.

const OUT = 'import-report';
const YEAR = 2025;

function text(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return String(v.getUTCFullYear());
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
    .replace(/[«»"'’`]/g, '')
    .replace(/[.,:;()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
/**
 * One column of a register, and what it means.
 *
 * Seven sheets across four files, and they come in one shape after all: a
 * column of people, and other columns of the same row saying what those people
 * did. Whether the row is a person (Дані ННВ) or a рада, a проєкт or an освітня
 * програма (everything else) only changes which column the names are in.
 */
interface Rule {
  /** the column holding one name or a comma-separated list of them */
  names: number;
  /** itemNumber in the 2025 template */
  item: string;
  /** the choice, spelled exactly as the template spells it */
  option?: string;
  /** …or the column naming the role, matched against the option labels */
  role?: number;
  /** narrow the options to those containing this — 3.18's категорія «А»/«Б» */
  group?: string;
  /** only when this column says `true` */
  flag?: number;
  /** this column holds how many times, not whether */
  count?: number;
  /** this column holds the indicator's own quantity — 2.1's годин */
  amount?: number;
  /** «балів / група розробників»: the points are split among everybody listed */
  sharedByGroup?: boolean;
  /** the column that says what it was, for the evidence text */
  title?: number;
  /** a further condition on the row */
  when?: (get: (c: number) => string) => boolean;
}

interface Register {
  file: string;
  sheet: string;
  /** rows before the data starts */
  headerRows: number;
  /** the whole row belongs to another year */
  skipRow?: (get: (c: number) => string) => boolean;
  rules: Rule[];
}

// «Рік акредитації» — an ОП being accredited in 2026 is next year's business.
const notNextYear = (get: (c: number) => string) => get(5) !== '2026';

const REGISTERS: Register[] = [
  {
    file: 'Дані Аспірантура',
    sheet: 'Спеціалізовані вчені ради',
    headerRows: 1,
    rules: [
      { names: 2, item: '3.17', option: 'голова', title: 1 },
      {
        names: 3,
        item: '3.17',
        option: 'заступник, відповідальний секретар, вчений секретар',
        title: 1,
      },
      { names: 4, item: '3.17', option: 'член ради', title: 1 },
    ],
  },
  {
    file: 'Дані ННЦЗЯО',
    sheet: 'Ради',
    headerRows: 1,
    rules: [
      { names: 2, item: '1.8', option: 'голова', title: 1 },
      { names: 3, item: '1.8', option: 'секретар', title: 1 },
      { names: 4, item: '1.8', option: 'член ради', title: 1 },
    ],
  },
  {
    file: 'Дані ННЦЗЯО',
    sheet: 'Відомості про ОП',
    headerRows: 1,
    skipRow: (get) => !notNextYear(get),
    rules: [
      // 1.7 prices a гарант ten times higher «на рік акредитації» — 1000
      // against 100 — and the register has a «Рік акредитації» column that
      // looks like the answer. It is not: the university awarded 100 to all
      // three people whose ОП carries 2025, and their sheet is what the ставки
      // were spread on. The column records when accreditation is DUE.
      {
        names: 6,
        item: '1.7',
        option: 'на поточний навчальний рік (за умови реалізації ОП)',
        title: 1,
      },
      {
        names: 7,
        item: '1.7',
        option:
          'Член групи науково-педагогічних працівників, які відповідають за реалізацію освітньої програми',
        title: 1,
      },
      {
        names: 8,
        item: '2.4',
        option: 'Підготовка матеріалів акредитаційного самоаналізу',
        sharedByGroup: true,
        title: 1,
      },
      {
        names: 9,
        item: '2.4',
        option: 'Розробка та оформлення освітніх програм зі спеціальності',
        sharedByGroup: true,
        title: 1,
      },
      {
        names: 10,
        item: '2.4',
        option: 'Оновлення освітніх програм зі спеціальності',
        sharedByGroup: true,
        title: 1,
      },
    ],
  },
  {
    file: 'Дані ННЦЗЯО',
    sheet: 'Навчальні плани',
    headerRows: 1,
    rules: [
      {
        names: 5,
        item: '2.5',
        option: 'Розробка та оформлення нового навчального плану',
        sharedByGroup: true,
        title: 1,
      },
      { names: 6, item: '2.5', option: 'Оновлення навч. плану', sharedByGroup: true, title: 1 },
    ],
  },
  {
    file: 'Дані ННЦЗЯО',
    sheet: 'Обовязки',
    headerRows: 1,
    rules: [
      { names: 1, item: '2.1', amount: 2 },
      { names: 1, item: '2.6', option: 'Виконання обов’язків голови предметної комісії', flag: 3 },
      { names: 1, item: '2.6', option: 'Виконання обов’язків члена предметної комісії', flag: 4 },
      {
        names: 1,
        item: '2.9',
        option: 'Відповідальний за інформаційне наповнення сайту структурного підрозділу',
        flag: 5,
      },
      {
        names: 1,
        item: '2.9',
        option:
          'Відповідальний за наповнення сторінки структурного підрозділу в соціальних мережах',
        flag: 6,
      },
    ],
  },
  {
    file: 'Дані ННВ',
    sheet: String(YEAR),
    headerRows: 1,
    rules: [
      { names: 1, item: '3.4', role: 3, title: 2 },
      { names: 1, item: '3.16', flag: 4 },
      // Category «А» and «Б» price the same roles differently, so the role
      // alone does not identify the choice — the pair of columns does.
      { names: 1, item: '3.18', role: 6, group: '"А"', title: 5 },
      { names: 1, item: '3.18', role: 8, group: '"Б"', title: 7 },
      {
        names: 1,
        item: '3.18',
        option: 'Внесення даних та супровід сайту наукового збірника',
        flag: 9,
      },
      { names: 1, item: '3.26', flag: 10 },
      { names: 1, item: '3.27', count: 11 },
      { names: 1, item: '3.22', count: 12 },
    ],
  },
  {
    file: 'Дані ВМіжнароднихЗ',
    sheet: String(YEAR),
    // Row 1 names the indicator, row 2 the role within it
    headerRows: 2,
    rules: [
      { names: 3, item: '3.1', option: 'керівник/координатор проєкту', title: 1 },
      { names: 4, item: '3.1', option: 'менеджер, керівник академічної (робочої) групи', title: 1 },
      {
        names: 5,
        item: '3.1',
        option: 'учасник академічної групи / виконавець (тренер)',
        title: 1,
      },
      {
        names: 6,
        item: '3.1',
        option: 'виконавець (технічний та адміністративний персонал)',
        title: 1,
      },
      { names: 7, item: '3.2', option: 'керівник/координатор', title: 1 },
      { names: 8, item: '3.2', option: 'менеджер', title: 1 },
      { names: 9, item: '3.2', option: 'виконавець', title: 1 },
      { names: 10, item: '3.2', option: 'учасник', title: 1 },
      {
        names: 11,
        item: '3.3',
        option: 'Підготовка та подання на конкурс Міжнародних грантових програм та проєктів',
        title: 1,
      },
      {
        names: 12,
        item: '3.3',
        option: 'Підготовка та подання на конкурс Всеукраїнських грантових програм та проєктів',
        title: 1,
      },
    ],
  },
];

/** One thing one person did, as a register records it */
interface Entry {
  person: string;
  rule: Rule;
  where: string;
  title: string;
  /** what the role column said, when the rule reads its choice from one */
  roleText?: string;
  /** how many times */
  times: number;
  /** the indicator's own quantity (2.1's годин), or the group share */
  quantity?: number;
}

/**
 * A cell of names.
 *
 * They are comma-separated, and a name is three words — so anything shorter or
 * longer in the list is a note somebody typed and is reported rather than
 * quietly dropped. `false`/`true` and bare numbers are the flag and count
 * columns; those are read elsewhere and are not names.
 */
function namesIn(cell: string): string[] {
  const value = tidy(cell);
  if (!value || value === 'false' || value === 'true' || /^\d+([.,]\d+)?$/.test(value)) return [];
  return value
    .split(',')
    .map(tidy)
    .filter((n) => n.length > 0);
}

const isName = (s: string) => s.split(' ').length === 3;

async function readRegister(reg: Register): Promise<{ entries: Entry[]; notNames: string[] }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(`edu-reference/${reg.file}.xlsx`);
  const ws = wb.getWorksheet(reg.sheet);
  if (!ws) throw new Error(`${reg.file} has no «${reg.sheet}» sheet`);

  const entries: Entry[] = [];
  const notNames: string[] = [];
  const where = `${reg.file} → ${reg.sheet}`;

  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (n <= reg.headerRows) return;
    const get = (c: number) => tidy(text(row.getCell(c).value));
    if (reg.skipRow?.(get)) return;

    for (const rule of reg.rules) {
      if (rule.when && !rule.when(get)) continue;
      if (rule.flag !== undefined && get(rule.flag) !== 'true') continue;

      let times = 1;
      if (rule.count !== undefined) {
        const c = Number(get(rule.count).replace(',', '.'));
        if (!Number.isFinite(c) || c <= 0) continue;
        times = c;
      }

      let quantity: number | undefined;
      if (rule.amount !== undefined) {
        const a = Number(get(rule.amount).replace(',', '.'));
        if (!Number.isFinite(a) || a <= 0) continue;
        quantity = a;
      }

      // A rule that reads its role from another column needs one to read
      if (rule.role !== undefined && !get(rule.role)) continue;

      const listed = namesIn(get(rule.names));
      const people = listed.filter(isName);
      for (const odd of listed.filter((x) => !isName(x)))
        notNames.push(`${where} r${n} c${rule.names}: «${odd.slice(0, 50)}»`);
      if (people.length === 0) continue;

      // «балів / група розробників» — the points of the thing, split among
      // everybody who did it. Соловйова's 2.4 is 40 × (1/3 + 1/6 + 1/6 + 1/7)
      // = 32.38, and her sheet says 32.4.
      if (rule.sharedByGroup) quantity = 1 / people.length;

      for (const person of people) {
        entries.push({
          person,
          rule,
          where: `${where} r${n}`,
          title: rule.title !== undefined ? get(rule.title) : '',
          roleText: rule.role !== undefined ? get(rule.role) : undefined,
          times,
          quantity,
        });
      }
    }
  });

  return { entries, notNames };
}

async function main() {
  const apply = process.argv.includes('--apply');
  mkdirSync(OUT, { recursive: true });

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });

  try {
    // Every register file is expected to be there; a missing one is a silently
    // smaller import, which is the kind of thing nobody notices for a month.
    const present = new Set(readdirSync('edu-reference'));
    const missing = [...new Set(REGISTERS.map((r) => r.file))].filter(
      (f) => !present.has(`${f}.xlsx`)
    );
    if (missing.length > 0) throw new Error(`missing register files: ${missing.join(', ')}`);

    const template = await prisma.ratingTemplate.findUnique({
      where: { year: YEAR },
      select: {
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

    const staff = await prisma.staff.findMany({
      select: {
        id: true,
        lastName: true,
        firstName: true,
        patronymic: true,
        department: { select: { name: true } },
      },
    });
    const byName = byFullName(staff);

    const entries: Entry[] = [];
    const notNames: string[] = [];
    for (const reg of REGISTERS) {
      const read = await readRegister(reg);
      entries.push(...read.entries);
      notNames.push(...read.notNames);
      console.log(`${`${reg.file} → ${reg.sheet}`.padEnd(46)} ${read.entries.length} entries`);
    }

    const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
    const noPerson = new Map<string, number>();
    const noIndicator = new Map<string, number>();
    const noOption = new Map<string, number>();
    const failed = new Map<string, number>();
    const gained = new Map<string, number>();

    // What the university awarded each person against each indicator. Read
    // once, here, because the answer decides whether a register group is
    // written at all — see the gate below.
    //
    // **A blank workbook is skipped, and that is not a detail.** Two people
    // have two workbooks: Рибакова Тетяна is a сумісник with an empty form
    // under Менеджменту and a filled one under Практичної психології, and
    // Грейліх Ольга has a «(1)» copy beside her own. Keyed by name, the last
    // file read wins — and for Грейліх that is the empty one, which silently
    // emptied her awarded figures and made the gate below refuse everything
    // she had.
    const awarded = new Map<string, Map<string, number>>();
    /** The кафедра whose folder that person's workbook sits in */
    const sheetDept = new Map<string, string>();
    for (const f of workbooks()) {
      const sheet = await readSheet(f);
      if (!sheet || sheet.total === 0) continue;
      awarded.set(nameKey(sheet.person), itemTotals(sheet.blocks));
      if (sheet.department) sheetDept.set(nameKey(sheet.person), sheet.department);
    }
    console.log(`«Рейтинг» sheets read: ${awarded.size}`);

    /** One person's rows under one indicator, before they are allowed in */
    interface Group {
      person: string;
      item: string;
      rows: Prisma.ActivityCreateManyInput[];
      points: number;
      what: string[];
    }
    const groups = new Map<string, Group>();

    for (const e of entries) {
      // A register row names a person and never their кафедра — but the gate
      // below confirms the row against that person's «Рейтинг» workbook, and
      // the workbook sits in a кафедра folder. So the кафедра is the sheet's,
      // which is the only reading under which the row and its confirmation
      // describe the same person. Where a ПІБ is shared and no workbook
      // settles it, the row is reported rather than given to either.
      const found = resolvePerson(byName, e.person, sheetDept.get(nameKey(e.person)));
      if (found.ambiguous) {
        bump(noPerson, `${e.person} — двоє з таким ПІБ, реєстр не каже, хто саме`);
        continue;
      }
      const staffId = found.person?.id;
      if (!staffId) {
        bump(noPerson, e.person);
        continue;
      }

      const type = byItem.get(e.rule.item);
      if (!type) {
        bump(noIndicator, e.rule.item);
        continue;
      }

      let specs;
      try {
        specs = parseTypeSpecs(type);
      } catch {
        bump(failed, `${e.rule.item}: broken specs`);
        continue;
      }

      // «Психолінгвістика — член редакційної колегії», «ДФ 27.053.012 —
      // заступник…»: what it was, and in what capacity.
      const evidence: Record<string, unknown> = {
        title: [e.title, e.roleText ?? e.rule.option].filter(Boolean).join(' — ').slice(0, 500),
      };

      const select = specs.fields.find((f) => f.kind === 'select' && f.name === 'option');
      if (select && select.kind === 'select') {
        const wanted = norm(e.roleText ?? e.rule.option ?? '');
        // The role columns of Дані ННВ carry the choice by its own short name
        // («член редакційної колегії»), while the template's label prefixes it
        // with the group. Matching on the ending covers both.
        const pool = e.rule.group
          ? select.options.filter((o) => o.label.includes(e.rule.group!))
          : select.options;
        const hit =
          pool.find((o) => norm(o.label) === wanted) ??
          pool.filter((o) => norm(o.label).endsWith(wanted));
        const chosen = Array.isArray(hit) ? (hit.length === 1 ? hit[0] : undefined) : hit;
        if (!chosen) {
          bump(noOption, `${e.rule.item} «${(e.roleText ?? e.rule.option ?? '').slice(0, 45)}»`);
          continue;
        }
        evidence.option = chosen.value;
        if (!evidence.title) evidence.title = chosen.label.slice(0, 500);
      }

      // A quantity field takes the group share, or the indicator's own number
      const quantityField = specs.fields.find((f) => f.name === 'value' || f.name === 'credits');
      if (quantityField) evidence[quantityField.name] = e.quantity ?? 1;

      let priced;
      try {
        priced = computeScore(
          {
            code: type.code,
            coefficient: type.coefficient,
            scoring: specs.scoring,
            evidenceFields: specs.fields,
          },
          evidence
        );
      } catch (err) {
        bump(failed, `${e.rule.item}: ${(err as Error).message.slice(0, 55)}`);
        continue;
      }

      const key = `${staffId}|${e.rule.item}`;
      const group = groups.get(key) ?? {
        person: e.person,
        item: e.rule.item,
        rows: [],
        points: 0,
        what: [],
      };
      for (let n = 0; n < e.times; n++) {
        group.rows.push({
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
      group.points += priced.score * e.times;
      if (group.what.length < 4) group.what.push(String(evidence.title).slice(0, 60));
      groups.set(key, group);
    }

    // ── The gate ──
    //
    // The register says WHAT somebody did; the «Рейтинг» sheet says what it
    // came to, and the sheet is what the university published and spread the
    // ставки on. So a register group is written only where the two agree — and
    // there it is strictly better than the sheet alone, because it knows голова
    // from член ради.
    //
    // Where they disagree the register is not written, and the group is
    // printed. It is nearly always the register being ahead of the rating:
    // Сердюк is listed six times on «Професійна освіта» and her 2025 sheet has
    // nothing under 3.18; Ржевська appears in four ННЦЗЯО registers and was
    // scored for none of them. Importing those would hand people points the
    // university did not give them, which is a worse error than a missing role.
    const ready: Prisma.ActivityCreateManyInput[] = [];
    const disagreed: {
      person: string;
      item: string;
      ours: number;
      theirs: number;
      what: string[];
    }[] = [];
    /** Register entries dropped so a group lands on the sheet's own figure */
    let trimmedIn = 0;
    for (const g of groups.values()) {
      const theirs = awarded.get(nameKey(g.person))?.get(g.item) ?? 0;

      // ── Where the register has MORE than the sheet awarded ──
      //
      // Almost always because it kept going after the workbook was made. Drop
      // whole entries until the two agree, and the roles are still the відділ's
      // own — which is the whole point, and is not something the amount can
      // work out on its own.
      //
      // Ковтун Олександр is the case that shows why. The register gives him
      // four Erasmus+ projects as менеджер (350) and two as учасник (150) —
      // 1700. His sheet says 1350, which is three менеджер plus two учасник.
      // Read from the amount alone, 1350 is «керівник × 3» or «учасник × 9»,
      // and BOTH are wrong: it is a mix of two roles, and no single price can
      // land on it. Dropping one менеджер entry reproduces the sheet exactly.
      let rows = g.rows;
      let points = g.points;
      if (points > theirs && theirs > 0) {
        let excess = points - theirs;
        const keep = [...rows].sort((a, b) => b.score - a.score);
        const dropped: typeof rows = [];
        for (const r of keep) {
          if (r.score > excess + 0.005) continue;
          dropped.push(r);
          excess -= r.score;
          if (same(excess, 0)) break;
        }
        if (same(excess, 0)) {
          const gone = new Set(dropped);
          rows = rows.filter((r) => !gone.has(r));
          points = theirs;
          trimmedIn += dropped.length;
        }
      }

      if (!same(theirs, points)) {
        disagreed.push({ person: g.person, item: g.item, ours: g.points, theirs, what: g.what });
        continue;
      }
      ready.push(...rows);
      gained.set(g.item, (gained.get(g.item) ?? 0) + points);
    }

    const total = [...gained.values()].reduce((s, v) => s + v, 0);
    console.log(`\nrows to write: ${ready.length}`);
    console.log(`points they carry: ${Math.round(total)}`);
    console.log(`entries dropped to land on the sheet's figure: ${trimmedIn}`);
    console.log(
      `groups the sheet does not confirm: ${disagreed.length}` +
        ` (${Math.round(disagreed.reduce((t, d) => t + d.ours, 0))} points left out)`
    );
    const lost = [
      ['person not in the system', noPerson],
      ['no such indicator in the template', noIndicator],
      ['the register names a choice the template has not got', noOption],
      ['scoring refused the row', failed],
    ] as const;
    for (const [what, m] of lost) {
      const n = [...m.values()].reduce((s, v) => s + v, 0);
      if (n > 0) console.log(`  ${what}: ${n} (${m.size} distinct)`);
    }
    if (notNames.length > 0) console.log(`  cells that are not a ПІБ: ${notNames.length}`);
    console.log('\npoints per indicator:');
    for (const [item, points] of [...gained].sort((a, b) => b[1] - a[1]))
      console.log(`  ${item.padEnd(6)} ${Math.round(points)}`);

    const report = [
      `# ${YEAR}: the відділи' own registers`,
      '',
      `Rows to write: **${ready.length}**, carrying **${Math.round(total)}** points.`,
      '',
      'Read from the `Дані *.xlsx` files rather than reverse-engineered out of the',
      '«Рейтинг» sheet, so every role is what the відділ recorded rather than what',
      'the amount implied. `pnpm import:verify-2025` checks the result against the',
      "university's own totals.",
      '',
      '| показник | балів |',
      '| --- | --- |',
      ...[...gained].sort((a, b) => b[1] - a[1]).map(([i, p]) => `| ${i} | ${Math.round(p)} |`),
      '',
      ...lost.flatMap(([what, m]) => {
        const n = [...m.values()].reduce((s, v) => s + v, 0);
        if (n === 0) return [];
        return [
          `## ${what} — ${n}`,
          '',
          ...[...m]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 60)
            .map(([k, v]) => `- \`${v}×\` ${k}`),
          '',
        ];
      }),
      ...(disagreed.length > 0
        ? [
            `## The sheet does not confirm these — ${disagreed.length}`,
            '',
            'The register records the work; the «Рейтинг» sheet does not award it, or',
            'awards a different amount. Nothing here was imported. Almost every case is',
            'the register being ahead of the rating — somebody added to a рада or a',
            'редколегія after the year was scored — but a few may be points the відділ',
            'forgot to pass on, and those are worth a look.',
            '',
            '| ПІБ | показник | у реєстрі | у таблиці | що саме |',
            '| --- | --- | --- | --- | --- |',
            ...[...disagreed]
              .sort((a, b) => b.ours - b.theirs - (a.ours - a.theirs))
              .map(
                (d) =>
                  `| ${d.person} | ${d.item} | ${d.ours.toFixed(2)} | ${d.theirs.toFixed(2)} | ${d.what.join('; ')} |`
              ),
            '',
          ]
        : []),
      ...(notNames.length > 0
        ? [
            `## Cells that are not a ПІБ — ${notNames.length}`,
            '',
            'Somebody typed a note into a column of names. Nothing was imported from',
            'them; they are here so the вiддiл can tidy the register.',
            '',
            ...notNames.slice(0, 60).map((s) => `- ${s}`),
            '',
          ]
        : []),
    ].join('\n');
    writeFileSync(join(OUT, `registers-${YEAR}.md`), report, 'utf8');
    console.log(`\n  → ${OUT}/registers-${YEAR}.md`);

    if (!apply) {
      console.log('\nNothing written. Re-run with --apply.');
      return;
    }

    // Everything this file imports is DIVISION_MANAGED, and the previous pass
    // over the «Рейтинг» sheet wrote the same indicators. Clear those rather
    // than add to them, or the year counts each of them twice.
    const items = [...new Set(REGISTERS.flatMap((r) => r.rules.map((x) => x.item)))];
    const typeIds = items.map((i) => byItem.get(i)?.id).filter(Boolean) as string[];
    await prisma.$transaction(
      async (tx) => {
        const dropped = await tx.activity.deleteMany({
          where: { year: YEAR, submittedByRole: 'SYSTEM', activityTypeId: { in: typeIds } },
        });
        console.log(`\nreplaced ${dropped.count} rows written from the «Рейтинг» sheet`);
        await tx.activity.createMany({ data: ready });
      },
      { timeout: 300_000 }
    );
    console.log(`Written: ${ready.length} activities for ${YEAR}.`);
    console.log('Next: pnpm db:recompute 2025 · pnpm import:verify-2025');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
