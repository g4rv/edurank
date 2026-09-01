import 'dotenv/config';
import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import ExcelJS from 'exceljs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import { ACTIVITY_TYPES_2026 } from '../lib/rating/activity-types';
import { LICENCE_POSITION_LINKS, dbSpecs } from '../lib/rating/db-specs';
import type { LicencePositionLink } from '../lib/kharakterystyka/positions';
import { ROOT, byFullName, itemCell, resolvePerson, text, tidy } from './rating-sheet-2025';

// The years the app never held a rating for, out of the university's own files.
//
//   pnpm import:kharakterystyka           — report, write nothing
//   pnpm import:kharakterystyka --apply   — write
//   pnpm import:kharakterystyka --undo    — remove every row it has ever written
//
// The undo removes IMPORT rows and nothing else: anything typed by hand is
// MANUAL and survives, because losing somebody's typed п.15 to a rollback of an
// unrelated import would be its own small disaster.
//
// ── WHAT THIS IS FOR ────────────────────────────────────────────────────────
//
// The Характеристика covers five years. Built for 2026 that is 2022–2026, and
// the database holds 2025 and 2026 — so three of the five years are blank for
// everybody, and no amount of linking indicators can change that.
//
// The Розділ workbooks have those years: one sheet per year, 2 118 rows for
// 2022, 1 684 for 2023, 6 145 for 2024, covering 202–264 people. This reads
// them.
//
// ── WHY NOT Activity ROWS ───────────────────────────────────────────────────
//
// Because 2022–2024 have no rating template, no score and no RatingEntry, and
// must never acquire one: those years were never scored by this app, and a
// ranking assembled from files that cover two thirds of the staff would be a
// ranking nobody should read. `KharakterystykaEntry` is invisible to
// `lib/rating/`, so nothing here can move a score or a ставка.
//
// ── WHAT IS DELIBERATELY DROPPED ────────────────────────────────────────────
//
// Everything whose indicator closes no licence position — 3.12 наукове
// консультування, 4.1/4.2 організація конференцій, 1.6 адмінпосада, 3.28
// цитування and the rest. It is real work; п.38 does not ask about it, and
// importing it would put rows in a table that only exists to answer п.38.
//
// ── RE-RUNNING ──────────────────────────────────────────────────────────────
//
// Idempotent by replacement: every IMPORT row for these three years is deleted
// and rewritten. MANUAL rows are never touched, so anything typed by hand
// survives a re-run — which matters, because this will be re-run whenever the
// label map is corrected.

const YEARS = [2022, 2023, 2024] as const;
const apply = process.argv.includes('--apply');
const undo = process.argv.includes('--undo');
const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL!) });

const norm = (s: string) =>
  tidy(s)
    .toLowerCase()
    .replace(/^\d+\.\d+\.?\s*/, '')
    .replace(/[«»"'’`]/g, '')
    .replace(/[.,:;()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// ── The 2026 catalogue, which owns the position links ───────────────────────

const catalogue = ACTIVITY_TYPES_2026.map((def) => ({ key: norm(def.label), def }));
const byLabel = new Map(catalogue.map((c) => [c.key, c.def]));
const uniquePrefix = (label: string) => {
  if (label.length < 20) return undefined;
  const hits = catalogue.filter((c) => c.key.startsWith(label) || label.startsWith(c.key));
  return hits.length === 1 ? hits[0].def : undefined;
};

/**
 * Labels the older files use that no longer match anything by text.
 *
 * **Item numbers are never used to match here.** They moved between every pair
 * of years — 2022's «3.18» is наукове консультування where 2025's is фахові
 * збірники, and matching on the number files somebody's consultancy as an
 * editorial board. Only the label decides, and where the label was reworded it
 * is written out below by hand.
 *
 * Keyed on the normalised label, so punctuation and case cannot break it.
 */
const REWORDED: Record<string, string> = {
  'ініціативна тематика кафедри за умови реєстрації в укрінтеі': 'initiative_topic',
  'підгтовка кадрів вищої кваліфікації': 'defense_supervision',
  'підготовка кадрів вищої кваліфікації': 'defense_supervision',
  'монографія видана мовою країн європейського союзу': 'monograph_eu',
  'монографія видана українською мовою': 'monograph_ua',
  'видання монографії': 'monograph_ua',
  'публікації у виданнях категорії б': 'publication_cat_b',
  'публікації у виданнях що входять до наукометричних баз даних категорії а': 'publication_cat_a',
  'участь у конференціях в україні': 'conf_ukraine',
  'участь у міжнародних всеукраїнських наукових конференціях симпозіумах семінарах круглих столах':
    'conf_ukraine',
  'участь у міжнародних наукових конференціях симпозіумах семінарах круглих столах': 'conf_abroad',
  'наукове консультування установ організацій не менше 3-ох років': 'org_consulting',
  'робота по виданню фахових наукових збірників журналів': 'journal_editorial_b',
  'робота у спеціалізованих вчених радах': 'specialized_council',
  'опонування та експертиза дисертацій': 'dissertation_opponent',
  'отримання свідоцтв/патентів на обєкти інтелектуальної власності': 'copyright_registration',
  'отримання свідоцтв патентів на обєкти інтелектуальної власності': 'copyright_registration',
  'участь радах робочих групах та інших обєднань мон та назяво': 'mon_nazyavo_councils',
  'участь у радах робочих групах та інших обєднаннях мон та назяво': 'mon_nazyavo_councils',
  'експертиза підручників у складі груп мон україни': 'mon_textbook_expertise',
  'видання затверджені вченою радою університету': 'edition_publication',
  'проведення відкритих лекцій в рамках реалізації міжнародних проєктів та програм':
    'intl_open_lectures',
  // «за кордоном» is the older files' way of saying what 2026 calls
  // «міжнародних» — the same conference indicator under two names.
  'участь у міжнародних всеукраїнських наукових конференціях симпозіумах семінарах круглих столах за кордоном':
    'conf_abroad',
  'участь у міжнародних всеукраїнських наукових конференціях за кордоном': 'conf_abroad',
  // The tour number moved from І to ІІ between the two catalogues; the жюрі is
  // the same work and п.14 asks about the конкурс, not about which round.
  'робота у складі оргкомітету/журі і туру студентських олімпіад та конкурсів конкурсів наукових робіт ман':
    'olympiad_jury',
  'видання з грифом вченої ради університету': 'edition_publication',
  'підготовка здобувачів що стали призерами всеукраїнських змагань': 'ukr_olympiad_winners',
  'захист дисертацій під керівництвом': 'defense_supervision',
  // Excel wrote the language variant as «undefined» in seven rows
  'видання монографії undefined': 'monograph_ua',
  // The older sheet asked for 50 hours where 2026 asks 30 — the licence
  // condition wants 50, so these rows are the stronger evidence, not weaker.
  'проведення навчальних занять іноземною мовою крім мовних дисциплін не менше 50 аудиторних годин':
    'foreign_language_teaching',
};

/**
 * Indicators the older files carry that close no п.38 position — recognised on
 * purpose, so they are counted as «skipped» rather than reported as a mapping
 * failure somebody has to look into.
 *
 * The first two are the owner's own rulings (2026-08-31): статті outside фахові
 * видання are not п.12, and рецензування робіт ІІ туру is not п.14.
 */
const KNOWN_NO_POSITION = new Set([
  'статті у наукових виданнях збірниках наукових праць та журналах',
  'статті у накових виданнях збірниках наукових праць та журналах крім збірників тез',
  'підготовка відгуків на автореферат',
  'рецензування перевірка наукових робіт іі туру всеукраїнського конкурсу',
]);

/**
 * How the older sheets name indicator 2.2's options.
 *
 * They write the plural — «навчальних посібників» — where the 2026 catalogue
 * has the singular, and that one word decides whether the row is a підручник
 * (п.3) or a методичка (п.4). Guessing would put методички under a requirement
 * for textbooks, which is the whole reason the condition exists.
 */
// A patent row now has to name its kind: since 2026-09-01 indicator 3.25 carries
// «Вид патенту», and позиція 2 asks for ONE патент на винахід but FIVE
// деклараційних. The older sheets say neither, so those rows fall into the
// «невідомий варіант» report below rather than landing on the bar of one — which
// is what they did before, and what made a корисна модель close the position.
// Add an alias here once somebody has read the sheets and can say which is which.
const OPTION_ALIASES: Record<string, string> = {
  'навчальних посібників': 'навчальний посібник',
  'навчально-методичних посібників': 'навчально-методичний посібник',
  підручників: 'підручник',
  'методичних рекомендацій': 'методичні рекомендації (словник, довідник)',
  'методичні рекомендації та практикуми': 'методичні рекомендації (словник, довідник)',
  практикуми: 'методичні рекомендації (словник, довідник)',
};

const matchCode = (label: string): string | undefined => {
  const key = norm(label);
  const direct = byLabel.get(key) ?? uniquePrefix(key);
  return direct?.code ?? REWORDED[key];
};

/** The evidence-field option labels for a code, so a `when` link can be judged */
const optionLabels = new Map<string, Map<string, string>>();
for (const def of ACTIVITY_TYPES_2026) {
  const fields = dbSpecs(def).evidenceFields;
  for (const field of fields) {
    if (field.kind !== 'select') continue;
    const map = new Map<string, string>();
    for (const option of field.options) map.set(norm(option.label), option.value);
    optionLabels.set(`${def.code}:${field.name}`, map);
  }
}

/**
 * Does a `when`-conditioned link apply to this row?
 *
 * Only indicator 2.2 has one: its chosen option decides whether the row is a
 * підручник (п.3) or a методичка (п.4). The legacy sheets name the option in
 * words rather than by value, so the words are looked up in that indicator's
 * own option list. A row naming nothing recognisable satisfies NEITHER — the
 * same методичка counting towards a підручник requirement is exactly what the
 * condition exists to stop.
 */
/**
 * Values that answer a question rather than evidence anything.
 *
 * `evidence` falls back to column B when column D is blank, and column B is a
 * dropdown — for the monograph rows a plain Так/Ні. Neither belongs in «Дані
 * підтвердження показника»: it is read against the Ліцензійні умови, and «Ні»
 * there asserts the opposite of what the row would be claiming.
 */
const NOT_EVIDENCE = new Set([
  'так',
  'ні',
  'ні.',
  'yes',
  'no',
  '-',
  '—',
  '–',
  '0',
  'н/д',
  'немає',
  'відсутні',
  'відсутній',
]);

function isEvidence(value: string): boolean {
  return !NOT_EVIDENCE.has(value.trim().toLowerCase());
}

/**
 * Drops a leading «Оберіть …:» — the form's own placeholder, which the older
 * sheets carry into the cell ahead of the real evidence («Оберіть тип:
 * кандидата наук (PhD) Дата: … ПІБ … Тема: …»). What follows it is good; the
 * prompt is an instruction to whoever was filling the form in.
 */
function stripPrompt(value: string): string {
  return value.replace(/^\s*обер[іи]ть[^:]{0,40}:\s*/iu, '').trim() || value.trim();
}

function whenApplies(code: string, link: LicencePositionLink, candidates: string[]): boolean {
  if (!link.when) return true;
  const labels = optionLabels.get(`${code}:${link.when.field}`);
  for (const candidate of candidates) {
    const key = norm(candidate);
    if (!key) continue;
    const value = labels?.get(key) ?? labels?.get(norm(OPTION_ALIASES[key] ?? ''));
    if (value !== undefined && link.when.in.includes(value)) return true;
  }
  return false;
}

// ── Reading the files ───────────────────────────────────────────────────────

function rozdilFiles(dir: string = ROOT, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) rozdilFiles(path, out);
    else if (path.includes('Розділ_') && path.endsWith('.xlsx') && !entry.startsWith('~$')) {
      out.push(path);
    }
  }
  return out;
}

interface RawRow {
  person: string;
  department: string;
  year: number;
  itemNumber: string;
  itemLabel: string;
  option: string;
  evidence: string;
}

async function readRows(path: string): Promise<RawRow[]> {
  const parts = path.split(/[\\/]/);
  const person = (parts.at(-1) ?? '').replace(/\.xlsx$/, '');
  const department = parts.at(-3) ?? '';

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.readFile(path);
  } catch {
    return [];
  }

  const rows: RawRow[] = [];
  for (const year of YEARS) {
    const sheet = wb.getWorksheet(String(year));
    if (!sheet) continue;
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const first = tidy(text(row.getCell(1).value));
      if (!first) return;
      rows.push({
        person,
        department,
        year,
        itemNumber: itemCell(row.getCell(1).value).match(/^(\d+\.\d+)/)?.[1] ?? '',
        itemLabel: first,
        option: tidy(text(row.getCell(2).value)),
        // Column D carries the evidence a person typed; column B is the option
        // they chose. A row with neither has nothing to print and is dropped —
        // an empty «Дані підтвердження показника» proves nothing.
        evidence: tidy(text(row.getCell(4).value)) || tidy(text(row.getCell(2).value)),
      });
    });
  }
  return rows;
}

// ── Import ──────────────────────────────────────────────────────────────────

const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

async function main() {
  if (undo) {
    const { count } = await prisma.kharakterystykaEntry.deleteMany({
      where: { source: 'IMPORT' },
    });
    console.log(`ПОВЕРНУТО: вилучено ${count} імпортованих записів.`);
    console.log('Записи, внесені вручну (MANUAL), не змінено.');
    await prisma.$disconnect();
    return;
  }

  const staff = await prisma.staff.findMany({
    where: { isNpp: true },
    select: {
      id: true,
      lastName: true,
      firstName: true,
      patronymic: true,
      department: { select: { name: true } },
    },
  });
  const index = byFullName(staff);

  const files = rozdilFiles();
  const raw: RawRow[] = [];
  for (const file of files) raw.push(...(await readRows(file)));
  console.log(`Розділ файлів: ${files.length} · рядків у ${YEARS.join('/')}: ${raw.length}\n`);

  interface Ready {
    staffId: string;
    position: number;
    group: string | null;
    year: number;
    text: string;
    itemNumber: string | null;
  }
  const ready: Ready[] = [];

  const noPerson = new Map<string, number>();
  const sameName = new Map<string, number>();
  const noIndicator = new Map<string, number>();
  const noPosition = new Map<string, number>();
  const noEvidence = new Map<string, number>();
  const notEvidence = new Map<string, number>();
  const optionUnknown = new Map<string, number>();
  const perYear = new Map<number, number>();
  const people = new Set<string>();

  for (const row of raw) {
    if (KNOWN_NO_POSITION.has(norm(row.itemLabel))) {
      bump(noPosition, `${row.itemNumber || '??'} ${norm(row.itemLabel).slice(0, 44)}`);
      continue;
    }

    const code = matchCode(row.itemLabel);
    if (!code) {
      bump(noIndicator, `${row.itemNumber || '??'} :: ${norm(row.itemLabel)}`);
      continue;
    }

    const links = LICENCE_POSITION_LINKS[code] ?? [];
    if (links.length === 0) {
      bump(noPosition, `${row.itemNumber || '??'} ${code}`);
      continue;
    }

    // Nothing to print is nothing to import — see `evidence` above
    if (!row.evidence) {
      bump(noEvidence, `${row.itemNumber || '??'} ${code}`);
      continue;
    }
    // A bare «Так» / «Ні» is the answer to column B's yes-no question, not
    // evidence — and column B is what `evidence` falls back to when column D is
    // empty. «Ні» means the person said they have NONE of this, so importing it
    // put «Виконано» on 25 documents whose evidence cell read «Ні»
    // (found 2026-09-01). Anything that only answers a question is dropped.
    if (!isEvidence(row.evidence)) {
      bump(notEvidence, `${row.itemNumber || '??'} «${row.evidence.slice(0, 24)}»`);
      continue;
    }

    const found = resolvePerson(index, row.person, row.department);
    if (found.ambiguous) {
      bump(sameName, `${row.person} — ${row.department}`);
      continue;
    }
    if (!found.person) {
      bump(noPerson, row.person);
      continue;
    }

    let landed = false;
    for (const link of links) {
      // Column B usually names the type; where it is blank the older sheets
      // put it in column D instead, so both are offered.
      if (!whenApplies(code, link, [row.option, row.evidence])) continue;
      landed = true;
      ready.push({
        staffId: found.person.id,
        position: link.position,
        group: link.group ?? null,
        year: row.year,
        text: stripPrompt(row.evidence),
        itemNumber: row.itemNumber || null,
      });
    }
    if (!landed) {
      bump(optionUnknown, `${code} «${(row.option || row.evidence).slice(0, 44)}»`);
      continue;
    }

    people.add(found.person.id);
    bump(perYear as unknown as Map<string, number>, String(row.year));
  }

  console.log('── до імпорту ──');
  for (const year of YEARS) {
    const n = ready.filter((r) => r.year === year).length;
    console.log(`  ${year}: ${n} записів`);
  }
  console.log(`  усього ${ready.length} записів для ${people.size} осіб\n`);

  const report = (title: string, m: Map<string, number>, limit = 12) => {
    if (m.size === 0) return;
    const total = [...m.values()].reduce((a, b) => a + b, 0);
    console.log(`── ${title}: ${total} рядків (${m.size} видів) ──`);
    for (const [k, n] of [...m].sort((a, b) => b[1] - a[1]).slice(0, limit)) {
      console.log(`  ${String(n).padStart(5)}  ${k}`);
    }
    if (m.size > limit) console.log(`  … ще ${m.size - limit}`);
    console.log('');
  };

  report('показник не зіставлено — ПОТРІБНА УВАГА', noIndicator, 20);
  report('показник не закриває позицію (пропускаємо навмисно)', noPosition, 8);
  report('порожні дані підтвердження', noEvidence, 5);
  report('не є доказом (Так / Ні тощо)', notEvidence, 5);
  report('варіант не розпізнано (2.2 підручник/методичка)', optionUnknown, 8);
  report('людину не знайдено', noPerson, 10);
  report('двоє з однаковим ПІБ на кафедрі', sameName, 5);

  if (!apply) {
    console.log('Нічого не записано. Щоб застосувати: pnpm import:kharakterystyka --apply');
    return;
  }

  const removed = await prisma.kharakterystykaEntry.deleteMany({
    where: { source: 'IMPORT', year: { in: [...YEARS] } },
  });
  await prisma.kharakterystykaEntry.createMany({
    data: ready.map((r) => ({ ...r, source: 'IMPORT' as const, createdBy: 'import' })),
  });
  console.log(`ЗАПИСАНО: ${ready.length} (видалено попередніх: ${removed.count})`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
