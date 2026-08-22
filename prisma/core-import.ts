import { readFileSync } from 'node:fs';
import type { PrismaClient } from '../lib/generated/prisma/client';
import { CORE_DATA_FILE, type CoreData } from './core-data';

// Put the exported university into this database.
//
// IDEMPOTENT BY CONSTRUCTION, because it will be run more than once: the first
// time on an empty production database, and again whenever the numbers are
// corrected here and carried over. Every row is matched on its natural key, so
// a second run updates what it wrote the first time instead of doubling it.
//
// TWO THINGS IT NEVER TOUCHES, both on purpose:
//
//   passwordHash / tokenVersion — the export carries no passwords, and neither
//   does an update here. Somebody who has already been invited and set a
//   password keeps it when the rating numbers are re-imported. Overwriting
//   these would sign the whole university out and lock out the admins.
//
//   Anything the live system owns — StudentClaim, the ставка pools and grids,
//   the audit log. Those are decisions made ON production; carrying a laptop's
//   copy over them would erase real work.
//
// ACTIVITIES ARE REPLACED, NOT MERGED. `Activity` has deliberately no unique
// key on (staff, type, year) — a person may hold five конференції of the same
// indicator — so there is nothing to upsert against. Re-running would silently
// double everybody's score. Instead every activity belonging to an imported
// person in an imported year is deleted first, then the file's rows are
// written. The delete is scoped to exactly what the file replaces: a year or a
// person the file does not mention is left alone.

export interface CoreImportResult {
  divisions: number;
  faculties: number;
  departments: number;
  staff: number;
  heads: number;
  deans: number;
  templates: number;
  activityTypes: number;
  activitiesDeleted: number;
  activities: number;
  ratingEntries: number;
  totalScore: number;
  admins: string[];
  missingStaff: string[];
  missingTypes: string[];
}

export function readCoreData(file = CORE_DATA_FILE): CoreData {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as CoreData;
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    throw new Error(
      `Не вдалося прочитати ${file}: ${why}\n` +
        'Створіть його на машині, де є edu-reference/: pnpm data:export'
    );
  }
}

export async function importCoreData(
  prisma: PrismaClient,
  data: CoreData
): Promise<CoreImportResult> {
  const date = (s: string | null) => (s ? new Date(s) : null);

  // ── Відділи ────────────────────────────────────────────────────────────────
  for (const d of data.divisions) {
    await prisma.division.upsert({
      where: { name: d.name },
      create: { name: d.name, registryKey: d.registryKey, canModerateRating: d.canModerateRating },
      update: { registryKey: d.registryKey, canModerateRating: d.canModerateRating },
    });
  }
  const divisionIds = await idsByName(
    prisma.division.findMany({ select: { id: true, name: true } })
  );

  // ── Факультети і кафедри ───────────────────────────────────────────────────
  // Deans and heads are set in a second pass: both point at a Staff row that
  // does not exist yet, and a кафедра must exist before anybody can belong to it.
  for (const f of data.faculties) {
    await prisma.faculty.upsert({ where: { name: f.name }, create: { name: f.name }, update: {} });
  }
  const facultyIds = await idsByName(prisma.faculty.findMany({ select: { id: true, name: true } }));

  for (const d of data.departments) {
    const facultyId = facultyIds.get(d.facultyName);
    if (!facultyId) throw new Error(`Кафедра «${d.name}»: немає факультету «${d.facultyName}»`);
    await prisma.department.upsert({
      where: { name_facultyId: { name: d.name, facultyId } },
      create: { name: d.name, facultyId },
      update: {},
    });
  }
  const departmentIds = await idsByName(
    prisma.department.findMany({ select: { id: true, name: true } })
  );

  // ── Люди ───────────────────────────────────────────────────────────────────
  for (const s of data.staff) {
    const fields = {
      lastName: s.lastName,
      firstName: s.firstName,
      patronymic: s.patronymic,
      phone: s.phone,
      role: s.role,
      isNpp: s.isNpp,
      isSystem: s.isSystem,
      archivedAt: date(s.archivedAt),
      archiveReason: s.archiveReason,
      employmentRate: s.employmentRate,
      pedagogicalExperience: s.pedagogicalExperience,
      academicRank: s.academicRank,
      scientificDegree: s.scientificDegree,
      degreeMatchesDepartment: s.degreeMatchesDepartment,
      degreeDefenceDate: date(s.degreeDefenceDate),
      adminPosition: s.adminPosition,
      basicEducationMatch: s.basicEducationMatch,
      basicEducationSpecialty: s.basicEducationSpecialty,
      wosUrl: s.wosUrl,
      wosCitationCount: s.wosCitationCount,
      scopusUrl: s.scopusUrl,
      scopusCitationCount: s.scopusCitationCount,
      googleScholarUrl: s.googleScholarUrl,
      googleScholarCitationCount: s.googleScholarCitationCount,
      orcidId: s.orcidId,
      departmentId: s.departmentName ? (departmentIds.get(s.departmentName) ?? null) : null,
      divisionId: s.divisionName ? (divisionIds.get(s.divisionName) ?? null) : null,
    };
    // No passwordHash and no tokenVersion in either branch — see the header.
    await prisma.staff.upsert({
      where: { email: s.email },
      create: { email: s.email, ...fields },
      update: fields,
    });
  }
  const staffIds = new Map(
    (await prisma.staff.findMany({ select: { id: true, email: true } })).map((s) => [s.email, s.id])
  );

  // Сумісництво: rewritten wholesale per person, so dropping a part-time
  // кафедра upstream actually removes it here too.
  for (const s of data.staff) {
    const staffId = staffIds.get(s.email)!;
    await prisma.staffDepartment.deleteMany({ where: { staffId } });
    for (const name of s.partTimeDepartmentNames) {
      const departmentId = departmentIds.get(name);
      if (departmentId) await prisma.staffDepartment.create({ data: { staffId, departmentId } });
    }
  }

  // ── Завідувачі і декани ────────────────────────────────────────────────────
  let heads = 0;
  for (const d of data.departments) {
    const id = departmentIds.get(d.name);
    const headId = d.headEmail ? (staffIds.get(d.headEmail) ?? null) : null;
    if (!id) continue;
    await prisma.department.update({ where: { id }, data: { headId } });
    if (headId) heads++;
  }
  let deans = 0;
  for (const f of data.faculties) {
    const id = facultyIds.get(f.name);
    const deanId = f.deanEmail ? (staffIds.get(f.deanEmail) ?? null) : null;
    if (!id) continue;
    await prisma.faculty.update({ where: { id }, data: { deanId } });
    if (deanId) deans++;
  }

  // ── Шаблони рейтингу ───────────────────────────────────────────────────────
  let activityTypeCount = 0;
  const typeIds = new Map<string, string>(); // `${year}:${code}` → id
  for (const t of data.templates) {
    const template = await prisma.ratingTemplate.upsert({
      where: { year: t.year },
      create: {
        year: t.year,
        name: t.name,
        isActive: t.isActive,
        status: t.status,
        closedAt: date(t.closedAt),
      },
      update: { name: t.name, isActive: t.isActive, status: t.status, closedAt: date(t.closedAt) },
    });

    const sectionIds = new Map<number, string>();
    for (const s of t.sections) {
      const section = await prisma.ratingSection.upsert({
        where: { templateId_number: { templateId: template.id, number: s.number } },
        create: { templateId: template.id, number: s.number, title: s.title },
        update: { title: s.title },
      });
      sectionIds.set(s.number, section.id);
    }

    for (const a of t.activityTypes) {
      const sectionId = sectionIds.get(a.sectionNumber);
      if (!sectionId) throw new Error(`${t.year} «${a.code}»: немає розділу ${a.sectionNumber}`);
      const fields = {
        sectionId,
        label: a.label,
        order: a.order,
        itemNumber: a.itemNumber,
        maxPerYear: a.maxPerYear,
        evidenceFields: a.evidenceFields ?? {},
        scoring: a.scoring ?? {},
        coefficient: a.coefficient,
        coefficientNote: a.coefficientNote,
        inputSource: a.inputSource,
        verifyingDivisionId: a.verifyingDivisionName
          ? (divisionIds.get(a.verifyingDivisionName) ?? null)
          : null,
        isActive: a.isActive,
        requiresVerification: a.requiresVerification,
        entityFirstEntry: a.entityFirstEntry,
        licencePositions: a.licencePositions ?? [],
      };
      const type = await prisma.activityType.upsert({
        where: { templateId_code: { templateId: template.id, code: a.code } },
        create: { templateId: template.id, code: a.code, ...fields },
        update: fields,
      });
      typeIds.set(`${t.year}:${a.code}`, type.id);
      activityTypeCount++;
    }
  }

  // ── Досягнення ─────────────────────────────────────────────────────────────
  const importedYears = [...new Set(data.activities.map((a) => a.year))];
  const importedStaffIds = data.staff
    .map((s) => staffIds.get(s.email))
    .filter((id): id is string => Boolean(id));

  const { count: activitiesDeleted } = await prisma.activity.deleteMany({
    where: { year: { in: importedYears }, staffId: { in: importedStaffIds } },
  });

  const missingStaff = new Set<string>();
  const missingTypes = new Set<string>();
  const rows = [];
  for (const a of data.activities) {
    const staffId = staffIds.get(a.staffEmail);
    const activityTypeId = typeIds.get(`${a.typeYear}:${a.typeCode}`);
    if (!staffId) {
      missingStaff.add(a.staffEmail);
      continue;
    }
    if (!activityTypeId) {
      missingTypes.add(`${a.typeYear}:${a.typeCode}`);
      continue;
    }
    rows.push({
      staffId,
      activityTypeId,
      year: a.year,
      evidence: a.evidence ?? {},
      computedValue: a.computedValue,
      score: a.score,
      status: a.status,
      submittedByRole: a.submittedByRole,
      approvedAt: date(a.approvedAt),
      removedAt: date(a.removedAt),
      removeReason: a.removeReason,
      verifiedAt: date(a.verifiedAt),
      createdAt: new Date(a.createdAt),
    });
  }
  // Chunked: one 11 800-row INSERT overruns the parameter limit.
  for (let i = 0; i < rows.length; i += 500) {
    await prisma.activity.createMany({ data: rows.slice(i, i + 500) });
  }

  // ── Рейтинги ───────────────────────────────────────────────────────────────
  let ratingEntries = 0;
  let totalScore = 0;
  for (const r of data.ratingEntries) {
    const staffId = staffIds.get(r.staffEmail);
    if (!staffId) {
      missingStaff.add(r.staffEmail);
      continue;
    }
    const fields = {
      section1Score: r.section1Score,
      section2Score: r.section2Score,
      section3Score: r.section3Score,
      section4Score: r.section4Score,
      section5Score: r.section5Score,
      totalScore: r.totalScore,
      snapshot: r.snapshot ?? undefined,
    };
    await prisma.ratingEntry.upsert({
      where: { staffId_year: { staffId, year: r.year } },
      create: { staffId, year: r.year, ...fields },
      update: fields,
    });
    ratingEntries++;
    totalScore += r.totalScore;
  }

  return {
    divisions: data.divisions.length,
    faculties: data.faculties.length,
    departments: data.departments.length,
    staff: data.staff.length,
    heads,
    deans,
    templates: data.templates.length,
    activityTypes: activityTypeCount,
    activitiesDeleted,
    activities: rows.length,
    ratingEntries,
    totalScore: Math.round(totalScore * 100) / 100,
    admins: data.staff.filter((s) => s.role === 'ADMIN' && !s.isSystem).map((s) => s.email),
    missingStaff: [...missingStaff],
    missingTypes: [...missingTypes],
  };
}

async function idsByName<T extends { id: string; name: string }>(
  query: Promise<T[]>
): Promise<Map<string, string>> {
  return new Map((await query).map((row) => [row.name, row.id]));
}
