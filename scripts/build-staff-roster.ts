import 'dotenv/config';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { normaliseDepartmentName } from '../lib/specialities/departments';
import { DEPARTMENTS } from '../prisma/preprod-org';
import { CONFIRMED_PATRONYMICS, PATRONYMICS } from './staff-patronymics';

// Turns the university's 31 per-кафедра .docx lists into one roster JSON.
//
//   pnpm staff:roster [outputPath]
//
// The lists are the authoritative, up-to-date set of НПП and their corporate
// addresses — one document per кафедра, each a four-column table. `УГСП_Дані.xlsx`
// is the older source but the only one carrying по батькові, so the two are
// merged here: names and emails from the .docx, the patronymic from the sheet.
//
// **THE PASSWORD COLUMN IS NEVER READ.** Every one of those documents holds a
// plaintext password beside each address. They are dropped at the only point
// where they are ever in memory, exactly as `build-accepted-students.ts` drops
// the РНОКПП and passport numbers out of the ЄДЕБО export. Nothing downstream
// has any use for them, and EduRank issues its own activation links.
//
// **The output is NOT committed.** `.gitignore` covers `/staff-roster*.json`
// alongside `/edu-reference`: 300 colleagues' names and addresses must not
// enter the repository to get into a database. That is already the rule
// `prisma/staff-import.ts` follows, and it is why `--prod` only runs from a
// maintainer's machine.

const DOCX_DIR = 'edu-reference/names-emails';
const SHEET_PATH = 'edu-reference/УГСП_Дані.xlsx';
// The repo root, because that is where every reader looks —
// `prisma/staff-import.ts`, `import-profiles.ts`, `import-missing-staff.ts`,
// `report-missing-people.ts` and `scripts/legacy-report.ts` all open
// `staff-roster.json` there. Writing it beside `edu-reference/` instead left a
// second, older copy at the root, and the importers went on reading that one
// for five days. `.gitignore` covers `/staff-roster*.json`, so the rule that
// 300 colleagues' addresses never enter the repository still holds.
const DEFAULT_OUT = 'staff-roster.json';

/** «НПП» sheet columns, 1-based as exceljs numbers them */
const NPP = { pib: 2, department: 3 } as const;

export interface RosterPerson {
  /** «Прізвище Ім'я По батькові», patronymic filled from the sheet where found */
  fullName: string;
  /** Exactly as the .docx spells it — «Прізвище Ім'я», no patronymic */
  listedName: string;
  email: string;
  /**
   * Primary кафедра, spelled as `prisma/preprod-org.ts` spells it — NOT as the
   * document heading does.
   *
   * The headings disagree with the довідник in ways `normaliseDepartmentName`
   * cannot forgive: «УКРАЇНСЬКОЇ ЛІНГВІСТИКИ **І** МЕТОДИКИ» where the довідник
   * has «ТА», and «СОЦІАЛЬНИХ КОМУНІКАЦІЙ, ДОКУМЕНТОЗНАВСТВА» with «та
   * інформаційної діяльності» simply missing. Importing the heading verbatim
   * would create 31 кафедри the довідник cannot place, so every завідувач's
   * випускова-кафедра chips would be grey with nothing to click.
   */
  department: string;
  /**
   * The other кафедри this person is listed on — сумісництво.
   *
   * Seventeen people appear in two documents. That is not a duplicate to clean
   * up: `StaffDepartment` exists for exactly this, and dropping the second row
   * would lose a real part of somebody's job.
   */
  alsoIn: string[];
  /** The document heading(s) this person came from, kept so a mismatch is traceable */
  listedUnder: string[];
  /** False when no по батькові could be found — the row still imports */
  hasPatronymic: boolean;
}

/** One row as a document gives it, before the sheet and the merge have their say */
interface ListedRow {
  listedName: string;
  email: string;
  /** The document's own heading, ALL CAPS and not the довідник's spelling */
  department: string;
}

/** Words that carry no identity — «і» against «та» is the whole problem here */
const NOISE = new Set(['і', 'та', 'й', 'the', 'and']);

function tokens(name: string): Set<string> {
  return new Set(
    normaliseDepartmentName(name)
      .replace(/[.,]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !NOISE.has(w))
  );
}

/**
 * A document heading → the кафедра as the довідник spells it, or null.
 *
 * Token overlap rather than string distance, because the two disagree by whole
 * words: a truncated heading («…ДОКУМЕНТОЗНАВСТВА») shares every word it has
 * with its кафедра and merely lacks three more. Requiring every heading word to
 * appear in the candidate — and taking the candidate that shares the most —
 * resolves that without matching «спортивних ігор» to «спортивних дисциплін».
 *
 * Returns null rather than guessing when two candidates tie. Nothing here is
 * silently resolved; `main` prints every decision.
 */
function resolveDepartment(heading: string): { name: string; exact: boolean } | null {
  const wanted = tokens(heading);
  if (wanted.size === 0) return null;

  const exact = DEPARTMENTS.find(
    (d) => normaliseDepartmentName(d.name) === normaliseDepartmentName(heading)
  );
  if (exact) return { name: exact.name, exact: true };

  const scored = DEPARTMENTS.map((d) => {
    const have = tokens(d.name);
    const shared = [...wanted].filter((w) => have.has(w)).length;
    return { name: d.name, shared, covered: shared === wanted.size };
  })
    .filter((c) => c.covered)
    .sort((a, b) => b.shared - a.shared);

  if (scored.length === 0) return null;
  if (scored.length > 1 && scored[0].shared === scored[1].shared) return null;
  return { name: scored[0].name, exact: false };
}

/**
 * Trim, collapse spaces, lower-case, and normalise the apostrophes Ukrainian
 * names are written with four different ways.
 *
 * The same treatment `normaliseStudentName` gives a claim, and for the same
 * reason: «Дем'яненко» and «Дем’яненко» are one person and must not be two.
 */
function normalisePerson(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[’ʼ‘`´]/g, "'")
    .replace(/\s+/g, ' ');
}

/** «Прізвище Ім'я По батькові» → «прізвище ім'я», the key the two sources share */
function surnameAndFirst(fullName: string): string {
  return normalisePerson(fullName).split(' ').slice(0, 2).join(' ');
}

/** Word wraps a single run of text across many <w:t> elements; join them per paragraph */
function paragraphs(xml: string): string[] {
  return xml
    .split(/<w:p[ >]/)
    .map((p) =>
      [...p.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)]
        .map((m) => m[1])
        .join('')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .trim()
    )
    .filter(Boolean);
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * One кафедра's document → its people.
 *
 * Driven by the EMAIL, not by the table's shape. The four columns are supposed
 * to be № / ПІП / Логін / Пароль, but a heading repeats, a row is merged, or
 * somebody leaves a cell blank — and a positional parser turns that into a
 * person named «Пароль». An address is unmistakable, and the name is the last
 * non-numeric line before it.
 */
async function readDocx(path: string): Promise<{ heading: string; people: ListedRow[] }> {
  const zip = await JSZip.loadAsync(await readFile(path));
  const doc = zip.file('word/document.xml');
  if (!doc) throw new Error(`${path}: no word/document.xml`);

  const lines = paragraphs(await doc.async('string'));
  const heading = lines[0] ?? '';

  const people: ListedRow[] = [];
  for (let i = 0; i < lines.length; i++) {
    const email = lines[i];
    if (!EMAIL.test(email)) continue;

    // Walk back past the row number to the name. «1.» and «1» are both used.
    let name = '';
    for (let j = i - 1; j >= 0 && j > i - 5; j--) {
      const candidate = lines[j];
      if (/^\d+\.?$/.test(candidate)) continue;
      if (EMAIL.test(candidate)) break; // two addresses in a row — no name between
      name = candidate;
      break;
    }
    if (!name) continue;
    // The header row's «ПІП» and any stray column label
    if (/^(ПІП|ПІБ|Логін|Пароль|№)/i.test(name)) continue;

    people.push({ listedName: name, email: email.toLowerCase(), department: heading });
  }
  return { heading, people };
}

/** «Прізвище Ім'я» → «По батькові», from the older sheet */
async function patronymicsFromSheet(): Promise<{
  byKey: Map<string, string[]>;
  departmentByKey: Map<string, string>;
}> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(resolve(SHEET_PATH));
  const sheet = workbook.getWorksheet('НПП');
  if (!sheet) throw new Error(`${SHEET_PATH}: no «НПП» worksheet`);

  const byKey = new Map<string, string[]>();
  const departmentByKey = new Map<string, string>();

  for (let r = 2; r <= sheet.rowCount; r++) {
    const values = sheet.getRow(r).values as unknown[];
    const pib = cell(values[NPP.pib]);
    if (!pib) continue;
    const parts = pib.split(/\s+/);
    if (parts.length < 3) continue;

    const key = surnameAndFirst(pib);
    const patronymic = parts.slice(2).join(' ');
    // A list, because two people may share прізвище + ім'я. Ambiguity is
    // reported rather than resolved by picking the first — a wrong по батькові
    // is worse than none, since it becomes the name on every screen.
    byKey.set(key, [...(byKey.get(key) ?? []), patronymic]);
    departmentByKey.set(key, cell(values[NPP.department]));
  }
  return { byKey, departmentByKey };
}

/** exceljs gives formula cells as objects; the rendered value is what we want */
function cell(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object') {
    const v = value as { result?: unknown; text?: unknown; richText?: { text: string }[] };
    if (v.richText)
      return v.richText
        .map((t) => t.text)
        .join('')
        .trim();
    return String(v.result ?? v.text ?? '').trim();
  }
  return String(value).trim();
}

async function main() {
  const out = process.argv[2] ?? DEFAULT_OUT;

  const files = (await readdir(DOCX_DIR))
    .filter((f) => f.endsWith('.docx') && !f.startsWith('~$'))
    // «2 політології» before «10 екології» — the numbers are the кафедра order
    .sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0));

  const { byKey, departmentByKey } = await patronymicsFromSheet();

  const noPatronymic: string[] = [];
  const ambiguous: string[] = [];
  /** Filled from `staff-patronymics.ts` rather than the sheet — reported separately */
  const fromSite: string[] = [];
  const perFile: {
    file: string;
    heading: string;
    resolved: string | null;
    exact: boolean;
    count: number;
  }[] = [];

  /** Keyed by email — the one thing both sources agree is unique per person */
  const people = new Map<string, RosterPerson>();

  for (const file of files) {
    const { heading, people: rows } = await readDocx(join(DOCX_DIR, file));
    const match = resolveDepartment(heading);
    perFile.push({
      file,
      heading,
      resolved: match?.name ?? null,
      exact: match?.exact ?? false,
      count: rows.length,
    });

    for (const row of rows) {
      const key = surnameAndFirst(row.listedName);
      const unique = [...new Set(byKey.get(key) ?? [])];

      const existing = people.get(row.email);
      if (existing) {
        // Same person, second кафедра — сумісництво, not a duplicate.
        if (match) existing.alsoIn.push(match.name);
        existing.listedUnder.push(heading);
        continue;
      }

      const listed = row.listedName.trim().replace(/\s+/g, ' ');
      let fullName = listed;
      let hasPatronymic = false;

      // The sheet first, then the hand-checked table. The sheet is the
      // university's own record; `staff-patronymics.ts` only covers the people
      // who joined after it was written and therefore are not in it at all.
      const fromTable = CONFIRMED_PATRONYMICS.get(listed);
      if (unique.length === 1) {
        fullName = listed + ' ' + unique[0];
        hasPatronymic = true;
      } else if (unique.length > 1) {
        ambiguous.push(listed + ' — ' + unique.join(' / '));
      } else if (fromTable) {
        fullName = listed + ' ' + fromTable;
        hasPatronymic = true;
        fromSite.push(listed + ' → ' + fromTable);
      } else {
        noPatronymic.push(listed + ' (' + row.email + ') — ' + heading);
      }

      people.set(row.email, {
        fullName,
        listedName: listed,
        email: row.email,
        department: match?.name ?? heading,
        alsoIn: [],
        listedUnder: [heading],
        hasPatronymic,
      });
    }
  }

  // ── The same person under two ADDRESSES ──
  //
  // Сумісництво above is found by email, and that misses the one case where
  // the university issued a second address. Перчук Оксана Володимирівна heads
  // обліку and teaches on соціальних комунікацій, so she is in both documents;
  // the обліку list gives her `o.perchuk@` because `oksana.perchuk@` was
  // already taken by her own row in the документознавства list. Keyed by
  // email, one woman became two people, and the rating, the profile and the
  // headship of a кафедра split between them.
  //
  // A full ПІБ is the merge key here, and only where the по батькові is known:
  // «Перчук Оксана» alone could be two women, «Перчук Оксана Володимирівна»
  // twice over is one. Two genuine namesakes would be merged wrongly, so every
  // merge is printed below — check it when the number changes.
  const merged: string[] = [];
  const byPib = new Map<string, RosterPerson>();
  for (const person of [...people.values()]) {
    if (!person.hasPatronymic) continue;
    const first = byPib.get(person.fullName);
    if (!first) {
      byPib.set(person.fullName, person);
      continue;
    }
    if (person.department !== first.department) first.alsoIn.push(person.department);
    first.listedUnder.push(...person.listedUnder);
    merged.push(person.fullName + ' — ' + first.email + ' + ' + person.email);
    people.delete(person.email);
  }

  // The primary кафедра for somebody listed twice comes from the sheet, which
  // records one each; the documents cannot say which of the two it is. Where the
  // sheet does not know them, the first document wins and `alsoIn` carries the
  // rest — the import can still place them, and no кафедра is lost.
  for (const person of people.values()) {
    if (person.alsoIn.length === 0) continue;
    const sheetDepartment = departmentByKey.get(surnameAndFirst(person.listedName));
    const resolved = sheetDepartment ? resolveDepartment(sheetDepartment) : null;
    if (!resolved) continue;
    const all = [person.department, ...person.alsoIn];
    if (!all.includes(resolved.name)) continue;
    person.department = resolved.name;
    person.alsoIn = all.filter((d) => d !== resolved.name);
  }

  const roster = [...people.values()];
  await writeFile(resolve(out), JSON.stringify(roster, null, 2) + '\n', 'utf8');

  const rowCount = perFile.reduce((n, f) => n + f.count, 0);
  console.log(rowCount + ' рядків у ' + files.length + ' документах → ' + roster.length + ' осіб');
  console.log('Записано у ' + out + '\n');

  console.log('Кафедри — назва з документа → назва з довідника:');
  for (const f of perFile) {
    const mark = f.resolved === null ? '  ✗' : f.exact ? '  =' : '  ~';
    console.log(mark + ' ' + String(f.count).padStart(3) + '  ' + f.heading);
    if (f.resolved === null) console.log('         НЕ ЗІСТАВЛЕНО — виправте вручну');
    else if (!f.exact) console.log('         → ' + f.resolved);
  }

  const unresolved = perFile.filter((f) => f.resolved === null);
  if (unresolved.length > 0) {
    console.log('\nБез відповідника в довіднику: ' + unresolved.length + ' кафедр');
  }

  if (merged.length > 0) {
    console.log('\nОдна особа під двома адресами: ' + merged.length);
    for (const m of merged) console.log('  ' + m);
  }

  const shared = roster.filter((p) => p.alsoIn.length > 0);
  console.log('\nСумісництво (на двох кафедрах): ' + shared.length);
  for (const p of shared) {
    console.log('  ' + p.fullName + ' — ' + p.department + ' + ' + p.alsoIn.join(', '));
  }

  const withPatronymic = roster.filter((p) => p.hasPatronymic).length;
  console.log('\nЗ по батькові: ' + withPatronymic + ' з ' + roster.length);

  if (fromSite.length > 0) {
    console.log('\nДодано з сайту університету (staff-patronymics.ts): ' + fromSite.length);
    for (const line of fromSite) console.log('  ' + line);
  }

  if (noPatronymic.length > 0) {
    console.log('\nБез по батькові — спитати кафедру: ' + noPatronymic.length);
    for (const line of noPatronymic) console.log('  ' + line);
  }

  // The ones found but not trusted. Printed every run so they are not forgotten:
  // each is one flag away from being applied, and each needs one question asked.
  const pending = PATRONYMICS.filter((p) => !p.confirmed);
  if (pending.length > 0) {
    console.log('\nЗнайдено, але не підтверджено (не застосовано): ' + pending.length);
    for (const p of pending) {
      console.log('  ' + p.listedName + ' → ' + p.patronymic);
      console.log('      ' + p.source);
      if (p.doubt) console.log('      сумнів: ' + p.doubt);
    }
  }
  if (ambiguous.length > 0) {
    console.log('\nНеоднозначні (кілька по батькові на одне прізвище+ім’я): ' + ambiguous.length);
    for (const line of ambiguous) console.log('  ' + line);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
