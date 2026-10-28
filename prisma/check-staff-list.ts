import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import { parseDeputies, parseStaffSheet } from '../lib/staff-check/parse';
import {
  compareStaffList,
  type Finding,
  type FindingCategory,
  type StaffFix,
} from '../lib/staff-check/compare';
import { syncProfileDerived } from '../lib/rating/profile-derived';
import {
  ACADEMIC_STORED_SELECT,
  degreesOf,
  mirrorsForUpdate,
  storedAcademic,
} from '../lib/staff/academic';
import { degreeLevel, degreeName } from '../lib/staff/academic-options';
import { computeScore } from '../lib/rating/scoring';
import { parseTypeSpecs } from '../validations/activity-type-spec';

// Holds the university's own staff list and science-deputies table against a
// database, and says where they differ (owner, 2026-10-28).
//
//   DATABASE_URL=<a COPY of production> pnpm db:check-staff-list
//     [--staff edu-reference/staff.xlsx]
//     [--deputies "edu-reference/Заступники з науки.doc"]
//     [--year 2026]            the ставки year (default: the latest split)
//     [--out staff-check.xlsx] the report, one sheet per category
//     [--apply]                write the two trusted fixes (below)
//
// WHAT --apply WRITES — two things only (owner, 2026-10-28: the list comes from
// the head of HR, so HR knows these better than the profile):
// - the стаж (`pedagogicalExperience`), whenever it differs from the list;
// - the галузь of a degree stored as the bare level («Кандидат наук» →
//   «Кандидат педагогічних наук»), when the list names it and the level agrees.
// Nothing else — ставки, посади, звання, accounts, deputies — is ever written:
// the list is not trusted blindly, and a person decides those.
//
// The стаж PAYS RATING POINTS (pedagogical_experience), so every person is
// re-synced through `syncProfileDerived`, the same as a profile save, and the
// report prints the points before and after. The degree's галузь moves none:
// 1.3 pays the level. Archived people are skipped. Each person gets an audit
// entry with no user («—»). Safe to run twice — the second run finds nothing.
//
// RUN IT LOCALLY first, against a restored production backup: the list holds
// every person's ставка and degree. To change production, run it there with the
// list copied up, report first, then --apply.
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
  console.log(`\nЗвіт: ${outFile}.`);

  await applyFixes(
    findings,
    new Map(staffRows.map((s) => [s.id, s])),
    process.argv.includes('--apply')
  );
}

type StaffRow = {
  id: string;
  lastName: string;
  firstName: string;
  patronymic: string | null;
  archivedAt: Date | null;
  pedagogicalExperience: number | null;
  diplomas: { degree: string }[];
};

/** The стаж and the degree's галузь — the only two things the list may write */
async function applyFixes(findings: Finding[], staff: Map<string, StaffRow>, apply: boolean) {
  const byPerson = new Map<string, StaffFix[]>();
  for (const f of findings) {
    if (!f.fix || !f.staffId) continue;
    byPerson.set(f.staffId, [...(byPerson.get(f.staffId) ?? []), f.fix]);
  }

  // What a стаж pays in the open year, to show who gains or loses points
  const template = await prisma.ratingTemplate.findFirst({
    where: { isActive: true, status: 'OPEN' },
    select: {
      year: true,
      activityTypes: {
        where: { code: 'pedagogical_experience', isActive: true, inputSource: 'PROFILE_DERIVED' },
        select: { code: true, coefficient: true, evidenceFields: true, scoring: true },
      },
    },
  });
  const type = template?.activityTypes[0];
  const points = (years: number | null) => {
    if (!type || !years || years <= 0) return 0;
    const specs = parseTypeSpecs(type);
    return computeScore(
      {
        code: type.code,
        coefficient: type.coefficient,
        scoring: specs.scoring,
        evidenceFields: specs.fields,
      },
      { value: years }
    ).score;
  };

  const name = (s: StaffRow) => `${s.lastName} ${s.firstName} ${s.patronymic ?? ''}`.trim();
  const plans: { s: StaffRow; experience?: number; degrees: { from: string; to: string }[] }[] = [];
  const skipped: string[] = [];
  for (const [id, fixes] of byPerson) {
    const s = staff.get(id)!;
    if (s.archivedAt) {
      skipped.push(`${name(s)} — в архіві`);
      continue;
    }
    const plan = { s, degrees: [] as { from: string; to: string }[] } as (typeof plans)[number];
    for (const fix of fixes) {
      if (fix.field === 'pedagogicalExperience') plan.experience = fix.value;
      // Exactly one diploma of that bare level, or the guess is not ours to make
      else if (s.diplomas.filter((d) => d.degree === fix.from).length === 1) plan.degrees.push(fix);
      else
        skipped.push(
          `${name(s)} — ${degreeName('candidate', fix.from)}: не один диплом цього рівня`
        );
    }
    if (plan.experience !== undefined || plan.degrees.length) plans.push(plan);
  }
  plans.sort((a, b) => name(a.s).localeCompare(name(b.s), 'uk'));

  const experience = plans.filter((p) => p.experience !== undefined);
  const degrees = plans.filter((p) => p.degrees.length);
  let pointsMoved = 0;
  console.log(
    `\n── --apply запише: стаж — ${experience.length} осіб, галузь ступеня — ${degrees.length} осіб ──`
  );
  console.log('\nСтаж (система → список):');
  for (const p of experience) {
    const before = points(p.s.pedagogicalExperience);
    const after = points(p.experience!);
    pointsMoved += after - before;
    const delta = after === before ? '' : `   ${before} → ${after} б.`;
    const down = (p.s.pedagogicalExperience ?? 0) > p.experience! ? '   ↓ МЕНШЕ' : '';
    console.log(
      `  ${name(p.s)}: ${p.s.pedagogicalExperience ?? '—'} → ${p.experience}${delta}${down}`
    );
  }
  console.log(
    `  Бали рейтингу ${template?.year ?? ''} за стаж разом: ${pointsMoved >= 0 ? '+' : ''}${pointsMoved}`
  );
  console.log('\nГалузь ступеня:');
  for (const p of degrees)
    for (const d of p.degrees)
      console.log(
        `  ${name(p.s)}: ${degreeName(degreeLevel(d.to) ?? 'candidate', d.from)} → ${degreeName(degreeLevel(d.to) ?? 'candidate', d.to)}`
      );
  if (skipped.length) {
    console.log('\nПропущено:');
    for (const line of skipped) console.log(`  ${line}`);
  }

  if (!apply) {
    console.log('\nУ базі нічого не змінено. Запустіть з --apply, щоб записати стаж і галузь.');
    return;
  }

  for (const p of plans) {
    await prisma.$transaction(
      async (tx) => {
        const before = await tx.staff.findUniqueOrThrow({
          where: { id: p.s.id },
          select: { ...ACADEMIC_STORED_SELECT },
        });
        const data: Record<string, unknown> = {};
        const changes: Record<string, { from: unknown; to: unknown }> = {};
        if (p.experience !== undefined) {
          data.pedagogicalExperience = p.experience;
          changes.pedagogicalExperience = { from: before.pedagogicalExperience, to: p.experience };
        }
        if (p.degrees.length) {
          for (const d of p.degrees)
            await tx.diploma.updateMany({
              where: { staffId: p.s.id, degree: d.from },
              data: { degree: d.to },
            });
          const row = await tx.staff.findUniqueOrThrow({
            where: { id: p.s.id },
            select: { ...ACADEMIC_STORED_SELECT },
          });
          // The six mirror columns follow the list, as on every profile save
          Object.assign(data, mirrorsForUpdate(storedAcademic(row), { degrees: degreesOf(row) }));
          for (const d of p.degrees) {
            const slot = degreeLevel(d.to) === 'doctor' ? 'doctor' : 'candidate';
            changes[`${slot}Degree`] = {
              from: degreeName(slot, d.from),
              to: degreeName(slot, d.to),
            };
          }
        }
        await tx.staff.update({ where: { id: p.s.id }, data });
        await tx.auditLog.create({
          data: {
            action: 'UPDATE',
            entity: 'Staff',
            entityId: p.s.id,
            label: `${name(p.s)} — за списком штату (відділ кадрів)`,
            changes: changes as never,
          },
        });
        await syncProfileDerived(tx, p.s.id);
      },
      { timeout: 30_000 }
    );
  }
  console.log(`\nЗаписано: ${plans.length} осіб.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
