import { SPECIALITY_CODES } from '@/lib/specialities/codes';
import { normaliseStudentName } from '@/lib/stake/claims';
import type { Funding, StudentDegree, StudyForm } from '@/lib/stake/norms';

// Reading a наказ the деканат sends as a spreadsheet.
//
// PURE. No exceljs, no database, no `fs` — a sheet arrives here as rows of
// plain strings (`lib/students/import-sheet.ts` does that part) and leaves as
// register rows plus a list of what could not be read. That is what lets the
// CLI (`pnpm db:import-students`) and the /admin/students dialog share one set
// of rules instead of drifting into two.
//
// **The template is the five columns /admin/students shows** (owner,
// 2026-09-03), which is also the filter bar minus the рік. The рік is not in
// the file: one наказ is one campaign and the person importing it knows which,
// while a spreadsheet column is one more thing to get wrong.
//
// It reads OUR template only. A raw ЄДЕБО export carries the РНОКПП, passport
// number, phone and personal email of every applicant, and none of that may
// reach a server — the rule `scripts/build-accepted-students.ts` was written
// around. Converting an export into this template stays a local job.

/** One admission as the template describes it */
export interface SourceStudent {
  name: string;
  speciality: string;
  degree: StudentDegree;
  form: StudyForm;
  funding: Funding;
}

/** Trimmed, runs of whitespace collapsed. What a ПІБ is stored as. */
export function cleanName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

/** Header text as it is compared: lower-cased, depunctuated, spaces collapsed */
function headerKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[.:]+$/, '')
    .replace(/\s+/g, ' ');
}

/** A cell's text as the word maps compare it */
function cellKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

type Field = 'name' | 'degree' | 'form' | 'funding' | 'speciality' | 'specialisation';

/**
 * The template's headers, and what else is accepted for each.
 *
 * Matched BY NAME, so column order does not matter and extra columns are
 * ignored. A деканат that adds a «№» column, or sends the columns in a
 * different order, should not have their file refused over furniture.
 *
 * «Спеціалізація» is OPTIONAL, in both senses: a file without the column at all
 * still imports, and the cell is blank on most rows. It exists because that is
 * the shape the ЄДЕБО export already has — «A4 Середня освіта» in one column and
 * «A4.16 Захист України» in the next — so the деканат can fill our template by
 * copying two columns across instead of merging them by hand.
 */
export const TEMPLATE_HEADERS: {
  field: Field;
  label: string;
  accepts: string[];
  optional?: true;
}[] = [
  {
    field: 'name',
    label: 'ПІБ',
    accepts: [
      'піб',
      'прізвище, ім’я, по батькові',
      "прізвище, ім'я, по батькові",
      'вступник',
      'здобувач',
    ],
  },
  { field: 'degree', label: 'Ступінь', accepts: ['ступінь', 'окр', 'освітній рівень'] },
  { field: 'form', label: 'Форма', accepts: ['форма', 'форма навчання'] },
  { field: 'funding', label: 'Фінансування', accepts: ['фінансування', 'джерело фінансування'] },
  {
    field: 'speciality',
    label: 'Спеціальність',
    accepts: ['спеціальність', 'спеціальність та спеціалізація'],
  },
  {
    field: 'specialisation',
    label: 'Спеціалізація',
    accepts: ['спеціалізація', 'предметна спеціальність'],
    optional: true,
  },
];

const HEADER_FIELD = new Map<string, Field>(
  TEMPLATE_HEADERS.flatMap((h) => [
    [headerKey(h.label), h.field] as const,
    ...h.accepts.map((a) => [headerKey(a), h.field] as const),
  ])
);

/**
 * The words each enum cell accepts.
 *
 * Our own wording, plus the spellings the university's накази already use
 * (owner, 2026-09-03): the деканат writes «Денна (офлайн)» and «Заочна
 * (онлайн)» in their own transcriptions, and bouncing a file whose meaning is
 * unambiguous helps nobody.
 */
export const DEGREE_WORDS: Record<string, StudentDegree> = {
  бакалавр: 'BACHELOR',
  бакалавра: 'BACHELOR',
  магістр: 'MASTER',
  магістра: 'MASTER',
};

export const FORM_WORDS: Record<string, StudyForm> = {
  денна: 'FULL_TIME',
  'денна (офлайн)': 'FULL_TIME',
  офлайн: 'FULL_TIME',
  заочна: 'PART_TIME',
  'заочна (онлайн)': 'PART_TIME',
  онлайн: 'PART_TIME',
};

export const FUNDING_WORDS: Record<string, Funding> = {
  бюджет: 'STATE',
  бюджетна: 'STATE',
  держзамовлення: 'STATE',
  'державне замовлення': 'STATE',
  контракт: 'CONTRACT',
  контрактна: 'CONTRACT',
  'за кошти фізичних та юридичних осіб': 'CONTRACT',
  'за кошти фізичних та/або юридичних осіб': 'CONTRACT',
};

/**
 * Код → наша назва спеціальності.
 *
 * Inverted from `SPECIALITY_CODES` rather than written out again: one table,
 * and a code added there is understood here for free.
 */
const NAME_BY_CODE = new Map<string, string>();
for (const [name, codes] of Object.entries(SPECIALITY_CODES)) {
  if (codes.code && !NAME_BY_CODE.has(codes.code)) NAME_BY_CODE.set(codes.code, name);
}

const NAME_BY_LOWER = new Map<string, string>(
  Object.keys(SPECIALITY_CODES).map((name) => [cellKey(name), name])
);

/**
 * «C4 Психологія» → «Психологія».
 *
 * **The code decides, not the name.** The ЄДЕБО export and the наказ spell
 * спеціальності the way постанова 1021 does, and four of them disagree with
 * ours: «C1 Економіка та міжнародні економічні відносини» is our «Економіка»,
 * «I10 Соціальна робота та консультування» our «Соціальна робота», and so on.
 * Matching the name would import those four as errors every single time.
 *
 * Three lookups, in order, and only the first that hits is used:
 *
 * 1. **The code itself.** «A4.07» is its own speciality with its own норматив.
 * 2. **A4.021…A4.029 → A4.02.** Наказ 192 gives each foreign language its own
 *    code; our norm table has ONE row for all of them, because they share a
 *    норматив.
 * 3. **A sub-code falls back to its parent.** «C1.01 Економіка» is a
 *    спеціалізація of «C1 Економіка» and the same speciality to us — found
 *    against the real магістр наказ, where 21 of 781 rows carried it. This is
 *    deliberately a fallback and not a first resort: A4.07 must resolve to
 *    «Середня освіта (географія)», never to a bare «Середня освіта».
 *
 * A bare «A4 Середня освіта» resolves to nothing, and should: our norms price
 * each предметна спеціальність separately, so a row that does not say which
 * subject is a row nobody can score.
 *
 * The bare name is still accepted, for a file typed by hand from our own screen.
 */
export function specialityFromCell(cell: string): string | null {
  const text = cell.trim();
  if (!text) return null;

  const [head] = text.split(/\s+/);
  if (head) {
    const code = head.replace(/[.,;]+$/, '').toUpperCase();
    const candidates = [
      code,
      ...(/^A4\.02\d$/.test(code) ? ['A4.02'] : []),
      ...(code.includes('.') ? [code.slice(0, code.indexOf('.'))] : []),
    ];
    for (const candidate of candidates) {
      const byCode = NAME_BY_CODE.get(candidate);
      if (byCode) return byCode;
    }
  }

  return NAME_BY_LOWER.get(cellKey(text)) ?? null;
}

export interface ParsedTemplate {
  rows: SourceStudent[];
  /** Ukrainian sentences naming the sheet row — shown to the person importing */
  problems: string[];
}

/**
 * The sheet's rows, as text, turned into register rows.
 *
 * `cells[0]` must be the header row. Everything below it is data; a row whose
 * ПІБ is blank is a trailing empty row and is skipped in silence, because Excel
 * files are full of them.
 *
 * Refuses NOTHING on its own — it reports. The caller decides that a file with
 * problems is not imported, which is the rule the whole feature follows: a
 * partial import is a register quietly missing the students nobody can claim.
 */
export function parseTemplate(cells: readonly (readonly string[])[]): ParsedTemplate {
  const header = cells[0];
  if (!header) return { rows: [], problems: ['Файл порожній'] };

  const columnOf = new Map<Field, number>();
  header.forEach((text, index) => {
    const field = HEADER_FIELD.get(headerKey(text ?? ''));
    if (field && !columnOf.has(field)) columnOf.set(field, index);
  });

  const missing = TEMPLATE_HEADERS.filter((h) => !h.optional && !columnOf.has(h.field)).map(
    (h) => h.label
  );
  if (missing.length > 0) {
    return {
      rows: [],
      problems: [`У файлі бракує колонок: ${missing.join(', ')}. Завантажте шаблон.`],
    };
  }

  const rows: SourceStudent[] = [];
  const problems: string[] = [];

  for (let i = 1; i < cells.length; i++) {
    const row = cells[i]!;
    const at = (field: Field) => {
      const column = columnOf.get(field);
      return column === undefined ? '' : (row[column] ?? '').trim();
    };
    // +1 because a person counts the header as row 1, like Excel does.
    const line = i + 1;

    const name = cleanName(at('name'));
    if (!name) continue; // trailing blank rows

    const fail = (why: string) => problems.push(`Рядок ${line} (${name}): ${why}`);

    const degree = DEGREE_WORDS[cellKey(at('degree'))];
    if (!degree) {
      fail(`не розпізнано ступінь «${at('degree')}»`);
      continue;
    }

    const form = FORM_WORDS[cellKey(at('form'))];
    if (!form) {
      fail(`не розпізнано форму «${at('form')}»`);
      continue;
    }

    const funding = FUNDING_WORDS[cellKey(at('funding'))];
    if (!funding) {
      fail(`не розпізнано фінансування «${at('funding')}»`);
      continue;
    }

    // Спеціалізація decides when it is filled in — «A4 Середня освіта» names no
    // subject and our норми price each one apart, so the refinement is the
    // whole answer. Спеціальність is the fallback, which is what carries every
    // programme that has no спеціалізація at all.
    const speciality =
      specialityFromCell(at('specialisation')) ?? specialityFromCell(at('speciality'));
    if (!speciality) {
      const cells = [at('speciality'), at('specialisation')].filter(Boolean).join(' / ');
      fail(`не розпізнано спеціальність «${cells}»`);
      continue;
    }

    rows.push({ name, speciality, degree, form, funding });
  }

  if (rows.length === 0 && problems.length === 0) problems.push('У файлі немає жодного рядка');

  return { rows, problems };
}

export interface PlannedRow {
  year: number;
  name: string;
  nameNormalised: string;
  specialityId: string;
  degree: StudentDegree;
  form: StudyForm;
  funding: Funding;
}

export interface ImportPlan {
  create: PlannedRow[];
  skipped: SourceStudent[];
  problems: string[];
}

/**
 * The model's @@unique, as a string.
 *
 * Ступінь is deliberately absent — it follows from the programme, and the
 * database key does not carry it either. The two must agree, or this would plan
 * a row the database then rejects.
 */
export function importKey(
  year: number,
  student: Pick<SourceStudent, 'name' | 'speciality' | 'form' | 'funding'>
): string {
  return [
    year,
    normaliseStudentName(student.name),
    student.speciality,
    student.form,
    student.funding,
  ].join('|');
}

/**
 * What a run would do. Pure, so the rules are testable without a database.
 *
 * `existing` holds `importKey`s already in the database. Duplicates WITHIN the
 * file are skipped too — a наказ transcribed twice is the likeliest way one
 * arrives, and it is not an error worth stopping the whole import for.
 */
export function planImport(
  year: number,
  source: readonly SourceStudent[],
  specialityIds: ReadonlyMap<string, string>,
  existing: ReadonlySet<string>
): ImportPlan {
  const plan: ImportPlan = { create: [], skipped: [], problems: [] };
  const seen = new Set(existing);

  for (const student of source) {
    const specialityId = specialityIds.get(student.speciality);
    if (!specialityId) {
      plan.problems.push(`${student.name}: спеціальності «${student.speciality}» немає в базі`);
      continue;
    }

    const key = importKey(year, student);
    if (seen.has(key)) {
      plan.skipped.push(student);
      continue;
    }
    seen.add(key);

    plan.create.push({
      year,
      name: student.name,
      nameNormalised: normaliseStudentName(student.name),
      specialityId,
      degree: student.degree,
      form: student.form,
      funding: student.funding,
    });
  }

  return plan;
}
