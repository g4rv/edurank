import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import ExcelJS from 'exceljs';
import { PrismaClient } from '../lib/generated/prisma/client';
import { normaliseDepartmentName } from '../lib/specialities/departments';

// The real НПП, read straight out of the university's own spreadsheet.
//
// NOTHING IS GENERATED FROM THIS. Unlike the student register, there is no
// committed JSON: `edu-reference/` is gitignored on purpose, and 317
// colleagues' names and addresses must not enter the repository to get into a
// database. The sheet is read at seed time and the rows go straight to Postgres,
// so `--prod` only runs where the file is — a maintainer's machine, not a
// container. That is already how the deploy works (see docs/deployment.md).
//
// **Every account is created locked.** `passwordHash` is null, which `authorize`
// in lib/auth.ts refuses, so an imported person cannot sign in until an ADMIN
// sends them an activation link. The import itself sends no mail.

const SHEET_PATH = 'edu-reference/УГСП_Дані.xlsx';

/** «НПП» sheet columns, 1-based as exceljs numbers them */
const NPP = {
  pib: 2,
  department: 3,
  employmentRate: 4, // «Обсяг ставки» — empty in the 2026 file, kept for the day it is not
  experience: 5,
  rank: 6,
  degree: 7,
  email: 10,
} as const;

/** «Кафедри» sheet columns */
const KAF = { name: 1, head: 2 } as const;

const RANK_BY_SHEET_NAME: Readonly<
  Record<string, 'LECTURER' | 'SENIOR_LECTURER' | 'DOCENT' | 'PROFESSOR'>
> = {
  викладач: 'LECTURER',
  'старший викладач': 'SENIOR_LECTURER',
  доцент: 'DOCENT',
  професор: 'PROFESSOR',
};

/**
 * «Науковий ступінь» carries TWO facts in one string.
 *
 * «за спеціальністю кафедри» is not a different degree — it is the
 * `degreeMatchesDepartment` flag, which a PROFILE_DERIVED indicator scores.
 * Splitting it here is what stops 202 people losing that point.
 */
const DEGREE_BY_SHEET_NAME: Readonly<
  Record<string, { degree: 'CANDIDATE' | 'DOCTOR'; matches: boolean }>
> = {
  'кандидат наук (PhD)': { degree: 'CANDIDATE', matches: false },
  'кандидат наук (PhD) за спеціальністю кафедри': { degree: 'CANDIDATE', matches: true },
  'доктор наук': { degree: 'DOCTOR', matches: false },
  'доктор наук за спеціальністю кафедри': { degree: 'DOCTOR', matches: true },
};

/**
 * Кафедра names on the НПП sheet that no longer exist.
 *
 * One person still carries the кафедра's former name. uhsp.edu.ua lists exactly
 * one кафедра containing «музичн», so this is a rename that never reached his
 * row — see the note in preprod-org.ts.
 */
const RENAMED_DEPARTMENTS: Readonly<Record<string, string>> = {
  'Музичного мистецтва і методики навчання':
    'Кафедра мистецької освіти і візуально-музичних практик',
};

export interface ImportResult {
  imported: number;
  heads: number;
  withoutEmail: string[];
  duplicateEmails: string[];
}

export async function importRealStaff(prisma: PrismaClient): Promise<ImportResult> {
  const path = resolve(SHEET_PATH);
  if (!existsSync(path)) {
    throw new Error(
      `${SHEET_PATH} not found. --prod reads the university's spreadsheet directly and ` +
        `edu-reference/ is gitignored, so this mode only runs where that file is.`
    );
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);

  const departments = await prisma.department.findMany({ select: { id: true, name: true } });
  if (departments.length === 0) {
    throw new Error('No кафедри in the database — seed the structure before importing people.');
  }
  const departmentByName = new Map(departments.map((d) => [normaliseDepartmentName(d.name), d.id]));

  const rows = readStaffRows(workbook);
  const problems = validate(rows);
  if (problems.withoutEmail.length > 0 || problems.duplicateEmails.length > 0) {
    return { imported: 0, heads: 0, ...problems };
  }

  let imported = 0;
  for (const row of rows) {
    const departmentName = RENAMED_DEPARTMENTS[row.department] ?? row.department;
    const departmentId = departmentByName.get(normaliseDepartmentName(departmentName));
    if (!departmentId) throw new Error(`Unknown кафедра «${row.department}» for ${row.pib}`);

    const degree = row.degree ? DEGREE_BY_SHEET_NAME[row.degree] : undefined;
    if (row.degree && !degree) throw new Error(`Unknown ступінь «${row.degree}» for ${row.pib}`);

    const rank = row.rank ? RANK_BY_SHEET_NAME[row.rank] : undefined;
    if (row.rank && !rank) throw new Error(`Unknown звання «${row.rank}» for ${row.pib}`);

    const [lastName = '', firstName = '', ...rest] = row.pib.split(/\s+/);
    await prisma.staff.create({
      data: {
        email: row.email.toLowerCase(),
        lastName,
        firstName,
        patronymic: rest.join(' '),
        isNpp: true,
        role: 'USER',
        // Locked. An ADMIN invites them; nothing here can sign in.
        passwordHash: null,
        departmentId,
        academicRank: rank ?? null,
        scientificDegree: degree?.degree ?? null,
        degreeMatchesDepartment: degree?.matches ?? null,
        pedagogicalExperience: row.experience,
        // «Обсяг ставки» is empty in this file, and it is confidential besides —
        // an ADMIN fills it in later rather than the seed inventing one.
        employmentRate: null,
      },
    });
    imported++;
  }

  const heads = await assignHeads(prisma, workbook, departmentByName);
  return { imported, heads, withoutEmail: [], duplicateEmails: [] };
}

interface StaffRow {
  pib: string;
  department: string;
  email: string;
  rank: string;
  degree: string;
  experience: number | null;
}

function readStaffRows(workbook: ExcelJS.Workbook): StaffRow[] {
  const sheet = workbook.getWorksheet('НПП');
  if (!sheet) throw new Error('No «НПП» worksheet');

  const rows: StaffRow[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const values = sheet.getRow(r).values as unknown[];
    const pib = cell(values[NPP.pib]);
    if (!pib) continue;

    const experience = Number(cell(values[NPP.experience]));
    rows.push({
      pib,
      department: cell(values[NPP.department]),
      email: cell(values[NPP.email]),
      rank: cell(values[NPP.rank]).toLowerCase(),
      degree: cell(values[NPP.degree]),
      experience: Number.isFinite(experience) && experience > 0 ? Math.round(experience) : null,
    });
  }
  return rows;
}

/**
 * `Staff.email` is unique and required, so a missing or repeated address is not
 * something to paper over — the import writes NOTHING and hands back the names
 * to fix in the sheet. Importing 293 of 317 would leave 24 colleagues missing
 * from the system with only a careful count to reveal it.
 */
function validate(rows: StaffRow[]): Pick<ImportResult, 'withoutEmail' | 'duplicateEmails'> {
  const withoutEmail = rows.filter((row) => !row.email).map((row) => row.pib);

  const seen = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.email) continue;
    const key = row.email.toLowerCase();
    seen.set(key, [...(seen.get(key) ?? []), row.pib]);
  }
  const duplicateEmails = [...seen]
    .filter(([, people]) => people.length > 1)
    .map(([email, people]) => `${email} — ${people.join(', ')}`);

  return { withoutEmail, duplicateEmails };
}

/**
 * Sets `Department.headId` from the «Кафедри» sheet's «Завідувач кафедри».
 *
 * Деканів are deliberately not set: the «Факультети» sheet abbreviates them
 * («Дем'яненко Б.Л.»), and matching initials against full names would guess at
 * a role that grants read access across a whole faculty.
 */
async function assignHeads(
  prisma: PrismaClient,
  workbook: ExcelJS.Workbook,
  departmentByName: Map<string, string>
): Promise<number> {
  const sheet = workbook.getWorksheet('Кафедри');
  if (!sheet) return 0;

  let assigned = 0;
  for (let r = 2; r <= sheet.rowCount; r++) {
    const values = sheet.getRow(r).values as unknown[];
    const name = cell(values[KAF.name]);
    const head = cell(values[KAF.head]);
    if (!name || !head) continue;

    const departmentId = departmentByName.get(normaliseDepartmentName(name));
    if (!departmentId) continue; // «Проректор» and anything else that is not a кафедра

    const [lastName = '', firstName = '', ...rest] = head.split(/\s+/);
    const staff = await prisma.staff.findFirst({
      where: { lastName, firstName, patronymic: rest.join(' ') },
      select: { id: true },
    });
    if (!staff) continue;

    await prisma.department.update({ where: { id: departmentId }, data: { headId: staff.id } });
    assigned++;
  }
  return assigned;
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
