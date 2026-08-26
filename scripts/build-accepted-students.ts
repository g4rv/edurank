import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ExcelJS from 'exceljs';
import { SPECIALITY_DEPARTMENTS } from '@/lib/specialities/departments';
import { DEPARTMENTS, FACULTIES } from '@/prisma/preprod-org';

// Builds `lib/students/accepted-2026.json` from TWO sheets.
//
//   pnpm students:build [path/to/list.xlsx] [year]
//
// Run once per admission campaign; the JSON it writes is committed and is what
// the app reads. This script is NOT part of the build — the ЄДЕБО sheet carries
// the РНОКПП, passport number, phone and personal email of every applicant, and
// none of that may reach a server. Six columns come out; the other 81 are
// dropped here, at the only point where they are ever in memory.
//
// The second sheet (`NAKAZ_SHEET`) is the later contract накази, transcribed.
// It is a separate source and not an afterthought: the ЄДЕБО export was taken
// on 13.08.2026 and накази №520 and №521 were signed on the 19th, so 316 people
// exist in no export at all. Without them an НПП who recruited one has nobody
// to pick and no way to say so.
//
// It refuses to write a partial file. An unknown speciality code or факультет
// throws, because the alternative is a register that silently lost the students
// nobody can then claim.

/** Columns of the ЄДЕБО export, 1-based as exceljs numbers them. */
const COL = {
  programme: 4, // Назва КП
  degree: 5, // ОКР
  speciality: 7, // Спеціальність — «D2 Фінанси, банківська справа…»
  specialisation: 8, // Спеціалізація — «A4.07 Географія», often empty
  form: 9, // Форма навчання
  faculty: 11, // Структурний підрозділ
  name: 14, // Вступник — «Прізвище Ім'я По батькові 13.12.1991»
  status: 19, // Статус заявки
  order: 33, // Наказ про зарахування
  wantsState: 36, // Претендує на бюджет
} as const;

/**
 * The sheet's code → the speciality name this application uses.
 *
 * Explicit rather than derived. The sheet writes the law's names («Історія та
 * громадянська освіта») where ours are додаток 5's («історія»), and its
 * sub-codes do not nest predictably — A4.021 belongs to A4.02, B11.041 to B11,
 * C1.01 to C1. A rule that got all three right would still be a rule nobody
 * could check against the наказ; a table can be read line by line.
 *
 * Keys are matched against Спеціалізація when the sheet fills it in, and
 * against Спеціальність otherwise. Values must exist in SPECIALITY_CODES — a
 * test pins that, so a typo here fails before the JSON is written.
 */
const SPECIALITY_BY_CODE: Readonly<Record<string, string>> = {
  A2: 'Дошкільна освіта',
  A3: 'Початкова освіта',
  'A4.01': 'Середня освіта (українська мова і література)',
  // The sheet names the language; our norm table has one row for all of them.
  'A4.021': 'Середня освіта (іноземна мова і література)',
  'A4.03': 'Середня освіта (історія)',
  'A4.04': 'Середня освіта (математика)',
  'A4.05': 'Середня освіта (біологія та здоров’я людини)',
  'A4.07': 'Середня освіта (географія)',
  'A4.09': 'Середня освіта (інформатика)',
  'A4.10': 'Середня освіта (трудове навчання і технології)',
  'A4.11': 'Середня освіта (фізична культура)',
  'A4.12': 'Середня освіта (образотворче мистецтво)',
  'A4.13': 'Середня освіта (музичне мистецтво)',
  'A4.15': 'Середня освіта (природничі науки)',
  'A4.16': 'Середня освіта (захист України)',
  'A5.38': 'Професійна освіта (транспорт)',
  'A5.39': 'Професійна освіта (цифрові технології)',
  A7: 'Фізична культура і спорт',
  B10: 'Філософія',
  'B11.041': 'Філологія (переклад)',
  B13: 'Інформаційна, бібліотечна та архівна справа',
  C1: 'Економіка',
  'C1.01': 'Економіка',
  C2: 'Політологія',
  C4: 'Психологія',
  C7: 'Журналістика',
  D1: 'Облік і оподаткування',
  D2: 'Фінанси, банківська справа та страхування',
  D3: 'Менеджмент',
  D4: 'Публічне управління та адміністрування',
  I10: 'Соціальна робота',

  // ── Programmes додаток 5 omits ────────────────────────────────────────────
  // Both took students in 2026 and neither is in додаток 5, so their нормативи
  // come from постанова 1134 directly — see the note in lib/stake/norms.ts.
  // «Музичне мистецтво» (B5) is the performer's degree and is NOT «Середня
  // освіта (музичне мистецтво)» (A4.13); the law gives them separate rows.
  B5: 'Музичне мистецтво',
  F3: "Комп'ютерні науки",
};

/**
 * The sheet's «Структурний підрозділ» → the факультет name in the database.
 *
 * The sheet drops the «Факультет» prefix and declines the name differently
 * («Мистецтв» where the university writes «мистецтва»), so this cannot be a
 * prefix-and-match. Values are byte-identical to prisma/preprod-org.ts,
 * including the apostrophe in «здоров'я» — a test pins both sides.
 */
const FACULTY_BY_SHEET_NAME: Readonly<Record<string, string>> = {
  'Соціально-психологічний': 'Факультет соціально-психологічний',
  'Гуманітарної освіти і соціальних технологій':
    'Факультет гуманітарної освіти і соціальних технологій',
  'Мистецтв, менеджменту, педагогіки і психології':
    'Факультет мистецтва, менеджменту, педагогіки і психології',
  'Природничої освіти': 'Факультет природничої освіти',
  'Технологічної і математичної освіти': 'Факультет технологічної і математичної освіти',
  'Української та іноземної філології': 'Факультет української та іноземної філології',
  'Фізичної культури, спорту і здоров’я': "Факультет фізичної культури, спорту і здоров'я",
  'Фінансово-економічної і професійної освіти':
    'Факультет фінансово-економічної і професійної освіти',
};

const DEGREE_BY_SHEET_NAME: Readonly<Record<string, 'BACHELOR' | 'MASTER'>> = {
  Бакалавр: 'BACHELOR',
  Магістр: 'MASTER',
};

const FORM_BY_SHEET_NAME: Readonly<Record<string, 'FULL_TIME' | 'PART_TIME'>> = {
  Денна: 'FULL_TIME',
  Заочна: 'PART_TIME',
};

/**
 * «Наказ про зарахування» → what the university admitted the person onto.
 *
 * Four накази per campaign, and the number is not a quantity — it identifies
 * WHICH наказ. A fifth number is not a fifth funding source, it is a sheet this
 * script has not been taught to read, so anything unlisted stops the build
 * rather than falling through to «контракт».
 */
const FUNDING_BY_ORDER: Readonly<Record<number, 'STATE' | 'CONTRACT'>> = {
  1: 'STATE',
  2: 'CONTRACT',
  3: 'STATE',
  4: 'CONTRACT',
};

/**
 * The transcribed накази — ПІБ, «код + назва спеціальності», форма, and nothing
 * else.
 *
 * The наказ is published as a PDF whose table cells wrap mid-word, so it is the
 * university's own transcription that is read here, not the PDF.
 */
const NAKAZ_SHEET = 'edu-reference/students_specialties.xlsx';

/**
 * What the накази say that their sheet does not have a column for.
 *
 * Both admit «студентами першого року навчання … за кошти фізичних та/або
 * юридичних осіб», and every row of both is a бакалавр — so ступінь and
 * фінансування are constants, not missing data. They live here, named after the
 * накази they come from, so a sheet transcribed from some later наказ cannot
 * quietly inherit them.
 */
const NAKAZ = {
  file: NAKAZ_SHEET,
  sheet: 'Студенти',
  orders: '№520 (денна) та №521 (заочна) від 19.08.2026',
  degree: 'BACHELOR',
  funding: 'CONTRACT',
} as const;

/** Columns of the наказ sheet, 1-based. */
const NAKAZ_COL = {
  name: 2, // «Прізвище, ім'я, по батькові»
  speciality: 3, // «A4 Середня освіта/A4.07 Географія»
  form: 4, // «Денна (офлайн)» / «Заочна (онлайн)»
} as const;

const FORM_BY_NAKAZ_NAME: Readonly<Record<string, 'FULL_TIME' | 'PART_TIME'>> = {
  'Денна (офлайн)': 'FULL_TIME',
  'Заочна (онлайн)': 'PART_TIME',
};

const FACULTY_OF_SHORT = new Map(FACULTIES.map((f) => [f.short, f.name]));
const FACULTY_OF_DEPARTMENT = new Map(
  DEPARTMENTS.map((d) => [d.name, FACULTY_OF_SHORT.get(d.faculty)])
);

/**
 * Speciality → факультет, through its випускова кафедра.
 *
 * The наказ names no факультет anywhere, and the register carries one per
 * student. Derived rather than invented: run over the 722 rows of the ЄДЕБО
 * export, this rule returns exactly the факультет the export itself gives for
 * all 32 of its спеціальності — so it is checked against 722 people before it
 * is trusted with 316.
 *
 * «Психологія» is the single exception, and the наказ cannot settle it: it is
 * taught by Кафедра психології (СП) and Кафедра практичної психології (ММПП)
 * under two конкурсні пропозиції the наказ prints under one name. Those
 * students take the first випускова кафедра's факультет. Nothing in the app
 * reads this field — `RegisterCriteria` leaves it out on purpose — so the cost
 * of the guess is a wrong word beside a name, never a student nobody can claim.
 */
function facultyOfSpeciality(speciality: string): string | undefined {
  const [department] = SPECIALITY_DEPARTMENTS[speciality] ?? [];
  return department ? FACULTY_OF_DEPARTMENT.get(department) : undefined;
}

interface AcceptedStudent {
  name: string;
  faculty: string;
  speciality: string;
  degree: 'BACHELOR' | 'MASTER';
  form: 'FULL_TIME' | 'PART_TIME';
  funding: 'STATE' | 'CONTRACT';
}

async function main() {
  const [sheetPath = 'edu-reference/list_of_students.xlsx', yearArg = '2026'] =
    process.argv.slice(2);
  const year = Number(yearArg);
  if (!Number.isInteger(year)) throw new Error(`Not a year: «${yearArg}»`);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(resolve(sheetPath));
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error(`No worksheet in ${sheetPath}`);

  const students: AcceptedStudent[] = [];
  const problems: string[] = [];
  /** Read, written, and reported — but not a reason to refuse the sheet */
  const warnings: string[] = [];

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber).values as (string | number | null)[];
    const rawName = text(row[COL.name]);
    if (!rawName) continue; // trailing blank rows

    const fail = (why: string) => problems.push(`row ${rowNumber} (${rawName}): ${why}`);

    // «Наказ про зарахування» is the whole test of who was admitted. Every row
    // in the 2026 sheet carries one and reads «До наказу» — a leftover status
    // from before the наказ was signed, so it is deliberately not checked.
    if (row[COL.order] == null || row[COL.order] === '') {
      fail('no наказ про зарахування');
      continue;
    }

    const name = studentName(rawName);

    const speciality = SPECIALITY_BY_CODE[codeOf(row)];
    if (!speciality) {
      fail(`unknown speciality «${text(row[COL.specialisation]) || text(row[COL.speciality])}»`);
      continue;
    }

    const faculty = FACULTY_BY_SHEET_NAME[text(row[COL.faculty])];
    if (!faculty) {
      fail(`unknown факультет «${text(row[COL.faculty])}»`);
      continue;
    }

    const degree = DEGREE_BY_SHEET_NAME[text(row[COL.degree])];
    if (!degree) {
      fail(`unknown ОКР «${text(row[COL.degree])}»`);
      continue;
    }

    const form = FORM_BY_SHEET_NAME[text(row[COL.form])];
    if (!form) {
      fail(`unknown форма «${text(row[COL.form])}»`);
      continue;
    }

    // The наказ decides. There are four each admission campaign — 1 and 3 admit
    // onto бюджет, 2 and 4 onto контракт (confirmed by the university
    // 2026-08-13) — and which one a person is named in is the outcome.
    //
    // «Претендує на бюджет» is only what the applicant ASKED for. It happens to
    // agree on all 722 rows of the 2026 sheet, so it is kept as a cross-check
    // and nothing more: where the two disagree the наказ is right, and the
    // warning is there because a disagreement more likely means this script is
    // reading the wrong column than that the наказ is wrong.
    const funding = FUNDING_BY_ORDER[Number(row[COL.order])];
    if (!funding) {
      fail(`наказ ${row[COL.order]} is not one of the four (1,3 = бюджет; 2,4 = контракт)`);
      continue;
    }
    const wished = text(row[COL.wantsState]) === 'Так' ? 'STATE' : 'CONTRACT';
    if (funding !== wished) {
      warnings.push(
        `row ${rowNumber} (${rawName}): наказ ${row[COL.order]} = ${funding}, ` +
          `«Претендує на бюджет» = ${wished}. Following the наказ.`
      );
    }

    students.push({ name, faculty, speciality, degree, form, funding });
  }

  students.push(...(await readNakaz(problems)));

  // One person may be admitted onto TWO programmes — eighteen of them are, and
  // sixteen of those sit one in each sheet — so a repeated ПІБ is not by itself
  // an error. What must never repeat is the key the claim is saved by, because
  // `findAcceptedStudent` looks a student up by exactly these four and would
  // otherwise return whichever of two people it met first.
  const seen = new Set<string>();
  for (const student of students) {
    const key = [
      student.name.toLowerCase(),
      student.speciality,
      student.form,
      student.funding,
    ].join('|');
    if (seen.has(key)) {
      problems.push(
        `${student.name}: listed twice on ${student.speciality} (${student.form}, ${student.funding})`
      );
    }
    seen.add(key);
  }

  if (problems.length > 0) {
    console.error(`Refusing to write — ${problems.length} row(s) could not be read:\n`);
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
  }

  students.sort((a, b) => a.name.localeCompare(b.name, 'uk'));

  const outPath = resolve(`lib/students/accepted-${year}.json`);
  writeFileSync(outPath, `${JSON.stringify(students, null, 2)}\n`, 'utf8');

  console.log(`Wrote ${students.length} students to ${outPath}\n`);
  if (warnings.length > 0) {
    console.warn(`${warnings.length} row(s) where the наказ and «Претендує на бюджет» disagree:`);
    for (const warning of warnings) console.warn(`  ${warning}`);
    console.warn('');
  }
  report('Факультет', students, (s) => s.faculty);
  report('Форма', students, (s) => s.form);
  report('Фінансування', students, (s) => s.funding);
  console.log(`\n  Спеціальностей: ${new Set(students.map((s) => s.speciality)).size}`);
}

/**
 * The накази's own students, whose sheet has three columns and no ЄДЕБО row.
 *
 * Ступінь and фінансування come from `NAKAZ`, факультет from the speciality —
 * see the notes on both. Everything else is refused rather than assumed: an
 * unreadable форма or an unknown speciality code lands in `problems` and stops
 * the write, the same as in the ЄДЕБО sheet.
 */
async function readNakaz(problems: string[]): Promise<AcceptedStudent[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(resolve(NAKAZ.file));
  const sheet = workbook.getWorksheet(NAKAZ.sheet);
  if (!sheet) throw new Error(`No «${NAKAZ.sheet}» worksheet in ${NAKAZ.file}`);

  const students: AcceptedStudent[] = [];

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const name = studentName(text(row.getCell(NAKAZ_COL.name).text));
    if (!name) continue; // trailing blank rows

    const fail = (why: string) =>
      problems.push(`${NAKAZ.sheet} row ${rowNumber} (${name}): ${why}`);

    const rawSpeciality = text(row.getCell(NAKAZ_COL.speciality).text);
    const speciality = SPECIALITY_BY_CODE[nakazCode(rawSpeciality)];
    if (!speciality) {
      fail(`unknown speciality «${rawSpeciality}»`);
      continue;
    }

    const faculty = facultyOfSpeciality(speciality);
    if (!faculty) {
      fail(`no випускова кафедра for «${speciality}», so no факультет`);
      continue;
    }

    const form = FORM_BY_NAKAZ_NAME[text(row.getCell(NAKAZ_COL.form).text)];
    if (!form) {
      fail(`unknown форма «${text(row.getCell(NAKAZ_COL.form).text)}»`);
      continue;
    }

    students.push({
      name,
      faculty,
      speciality,
      degree: NAKAZ.degree,
      form,
      funding: NAKAZ.funding,
    });
  }

  console.log(`Read ${students.length} students from ${NAKAZ.file} — накази ${NAKAZ.orders}`);
  return students;
}

/** «A4 Середня освіта/A4.07 Географія» → «A4.07»; the sub-code wins */
function nakazCode(speciality: string): string {
  const parts = speciality.split('/');
  return (parts[parts.length - 1] ?? '').trim().split(/\s+/)[0] ?? '';
}

/** «Дикий Андрій Михайлович 13.12.1991» → «Дикий Андрій Михайлович» */
function studentName(raw: string): string {
  return raw
    .replace(/\s+\d{2}\.\d{2}\.\d{4}$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** «A4.07 Географія» → «A4.07»; the sub-code wins where the sheet gives one */
function codeOf(row: (string | number | null)[]): string {
  const source = text(row[COL.specialisation]) || text(row[COL.speciality]);
  return source.split(/\s+/)[0] ?? '';
}

function text(value: string | number | null | undefined): string {
  return value == null ? '' : String(value).trim();
}

function report(label: string, students: AcceptedStudent[], by: (s: AcceptedStudent) => string) {
  const counts = new Map<string, number>();
  for (const student of students) counts.set(by(student), (counts.get(by(student)) ?? 0) + 1);
  console.log(`  ${label}:`);
  for (const [key, count] of [...counts].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(count).padStart(4)}  ${key}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
