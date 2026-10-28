import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import { parseDeputies, parseStaffSheet } from '../lib/staff-check/parse';
import { compareStaffList, type Finding, type FindingCategory } from '../lib/staff-check/compare';

// Holds the university's own staff list and science-deputies table against a
// database, and says where they differ (owner, 2026-10-28). REPORT ONLY —
// nothing is written to the database.
//
//   DATABASE_URL=<a COPY of production> pnpm db:check-staff-list
//     [--staff edu-reference/staff.xlsx]
//     [--deputies "edu-reference/Заступники з науки.doc"]
//     [--year 2026]            the ставки year (default: the latest split)
//     [--out staff-check.xlsx] the report, one sheet per category
//
// RUN IT LOCALLY, against a restored production backup (owner, 2026-10-28):
// the list holds every person's ставка and degree, and this way it never has to
// reach the server. edu-reference/ is not on the server anyway.
//
// The Word file is read with `antiword` (in Git for Windows' mingw64, or any
// Linux package); a .txt saved from Word works too. Read the categories in
// lib/staff-check/compare.ts before acting on them: several are NOT errors.

const CATEGORY_TITLES: Record<FindingCategory, string> = {
  unknownDepartment: 'Кафедру не впізнано',
  notInSystem: 'Є у списку, немає в системі',
  nameNoPatronymic: 'У системі немає по батькові',
  nameTypo: 'ПІБ написано по-різному',
  severalAccounts: 'Кілька облікових записів з таким ПІБ',
  archived: 'Є у списку, але в архіві',
  notNpp: 'Є у списку, але не позначено НПП',
  otherMainDepartment: 'Основна кафедра інша',
  partTimeMissing: 'Сумісництво не вказано',
  internalPartTime: 'Штатний і сумісник на одній кафедрі (ставку порівняно сумою)',
  partTimeOnlyButMainHere: 'У списку лише сумісник, у системі кафедра — основна',
  rateMissing: 'Ставка не розподілена',
  rateDiffers: 'Ставка відрізняється (система — розподіл завідувача)',
  headNotSet: 'Завідувач не призначений',
  positionDiffers: 'Посада відрізняється',
  titleDiffers: 'Вчене звання відрізняється',
  degreeUnspecified: 'Ступінь без галузі — список уточнює',
  degreeDiffers: 'Науковий ступінь відрізняється',
  degreeOnlyInSystem: 'Ступінь є в системі, у списку — ні',
  experienceOneYear: 'Стаж: у списку на 1 рік більше',
  experienceDiffers: 'Стаж відрізняється',
  onlyInSystem: 'Є в системі, немає у списку',
  deputyToSet: 'Заступник з науки — призначити',
  deputyDiffers: 'Заступник з науки відрізняється',
  deputySeveral: 'Кілька заступників (призначає адміністратор)',
  deputyFaculty: 'Заступник факультету (у системі такого поля немає)',
};

const arg = (name: string, fallback: string) => {
  const at = process.argv.indexOf(`--${name}`);
  return at > 0 && process.argv[at + 1] ? process.argv[at + 1] : fallback;
};

async function readSheet(file: string) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.worksheets[0];
  const text = (v: ExcelJS.CellValue): string | null => {
    if (v == null) return null;
    if (typeof v === 'object') {
      if ('richText' in v) return v.richText.map((t) => t.text).join('');
      if ('text' in v) return String(v.text);
      if ('result' in v) return v.result == null ? null : String(v.result);
      return null;
    }
    return String(v);
  };
  const rows: { row: number; cells: (string | null)[] }[] = [];
  ws.eachRow({ includeEmpty: true }, (row, n) => {
    if (n > 1)
      rows.push({ row: n, cells: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => text(row.getCell(i).value)) });
  });
  return parseStaffSheet(rows);
}

function readDeputiesText(file: string): string {
  if (file.toLowerCase().endsWith('.txt')) return readFileSync(file, 'utf8');
  // antiword cannot open a Cyrillic file name on Windows — read a copy
  const dir = mkdtempSync(path.join(tmpdir(), 'staff-check-'));
  try {
    const copy = path.join(dir, 'deputies.doc');
    copyFileSync(file, copy);
    return execFileSync('antiword', ['-m', 'UTF-8.txt', '-w', '0', copy], { encoding: 'utf8' });
  } catch (e) {
    throw new Error(
      `Не вдалося прочитати ${file} (потрібен antiword або .txt): ${(e as Error).message}`
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const staffFile = arg('staff', 'edu-reference/staff.xlsx');
  const deputiesFile = arg('deputies', 'edu-reference/Заступники з науки.doc');
  const outFile = arg('out', 'staff-check.xlsx');
  for (const f of [staffFile, deputiesFile])
    if (!existsSync(f)) throw new Error(`Немає файлу: ${f}`);

  const placements = await readSheet(staffFile);
  const deputies = parseDeputies(readDeputiesText(deputiesFile));

  const year =
    Number(arg('year', '0')) ||
    (await prisma.stakeDistribution.aggregate({ _max: { year: true } }))._max.year ||
    new Date().getFullYear();

  const [departments, staffRows, allocationRows] = await Promise.all([
    prisma.department.findMany({
      select: { id: true, name: true, headId: true, scienceDeputyId: true },
    }),
    prisma.staff.findMany({
      select: {
        id: true,
        lastName: true,
        firstName: true,
        patronymic: true,
        isNpp: true,
        archivedAt: true,
        departmentId: true,
        position: true,
        academicTitle: true,
        pedagogicalExperience: true,
        candidateDegree: true,
        doctorDegree: true,
        diplomas: { select: { degree: true } },
        partTimeDepartments: { select: { departmentId: true } },
      },
    }),
    prisma.stakeAllocation.findMany({
      where: { distribution: { year } },
      select: {
        staffId: true,
        proposedHundredths: true,
        distribution: { select: { departmentId: true } },
      },
    }),
  ]);

  const findings = compareStaffList({
    placements,
    deputies,
    departments,
    staff: staffRows.map((s) => ({
      id: s.id,
      lastName: s.lastName,
      firstName: s.firstName,
      patronymic: s.patronymic,
      isNpp: s.isNpp,
      archived: s.archivedAt !== null,
      departmentId: s.departmentId,
      partTimeDepartmentIds: s.partTimeDepartments.map((p) => p.departmentId),
      position: s.position,
      academicTitle: s.academicTitle,
      pedagogicalExperience: s.pedagogicalExperience,
      degreeKeys: [
        ...new Set(
          [...s.diplomas.map((d) => d.degree), s.candidateDegree, s.doctorDegree].filter(
            (k): k is string => !!k
          )
        ),
      ],
    })),
    allocations: new Map(
      allocationRows.map((a) => [
        `${a.staffId}|${a.distribution.departmentId}`,
        a.proposedHundredths,
      ])
    ),
  });

  // ── The summary ──
  const byCategory = new Map<FindingCategory, Finding[]>();
  for (const f of findings) byCategory.set(f.category, [...(byCategory.get(f.category) ?? []), f]);
  console.log(
    `Список: ${placements.length} записів · заступників: ${deputies.length} підрозділів · ставки за ${year}\n`
  );
  for (const category of Object.keys(CATEGORY_TITLES) as FindingCategory[]) {
    const list = byCategory.get(category);
    if (list) console.log(`  ${String(list.length).padStart(4)}  ${CATEGORY_TITLES[category]}`);
  }

  // ── The report: one sheet per category ──
  const wb = new ExcelJS.Workbook();
  const summary = wb.addWorksheet('Підсумок');
  summary.columns = [
    { header: 'Категорія', width: 62 },
    { header: 'Кількість', width: 12 },
  ];
  for (const category of Object.keys(CATEGORY_TITLES) as FindingCategory[]) {
    const list = byCategory.get(category);
    if (!list) continue;
    summary.addRow([CATEGORY_TITLES[category], list.length]);
    const ws = wb.addWorksheet(CATEGORY_TITLES[category].slice(0, 31).replace(/[\\/*?:[\]]/g, ' '));
    ws.columns = [
      { header: 'ПІБ', width: 38 },
      { header: 'Кафедра / підрозділ', width: 48 },
      { header: 'Рядок списку', width: 13 },
      { header: 'У списку', width: 40 },
      { header: 'У системі', width: 40 },
    ];
    for (const f of list)
      ws.addRow([f.person ?? '', f.department ?? '', f.row ?? '', f.list ?? '', f.system ?? '']);
    ws.getRow(1).font = { bold: true };
  }
  summary.getRow(1).font = { bold: true };
  await wb.xlsx.writeFile(outFile);
  console.log(`\nЗвіт: ${outFile}. У базі нічого не змінено.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
