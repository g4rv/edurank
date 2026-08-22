import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import { CORE_DATA_FILE, type CoreData } from './core-data';

// Take the real university out of this database and into one file.
//
// WHY THIS EXISTS. Production cannot build itself. `db:seed:staff` reads
// `staff-roster.json` and the whole 2025 import chain reads
// `edu-reference/ФАКУЛЬТЕТИ` — 142 MB of the university's own workbooks — and
// both are gitignored, so a container built from the repo on the server has
// nothing to read. The numbers were assembled and verified here, on a
// maintainer's machine; this carries that result over intact.
//
// NATURAL KEYS, NEVER IDS. Every reference is written as the thing a human
// would name — an email, a кафедра's name, an indicator's `code` — because
// production is not empty: `pnpm db:seed` has already created the відділи, the
// 2026 template and its ~67 indicators, the 8 факультети and 31 кафедри, each
// with its own cuid. Exporting cuids would either collide with those rows or
// duplicate them. Matching on the natural key means the import lands on what is
// already there and is safe to run twice.
//
// WHAT IS DELIBERATELY LEFT OUT:
//
//   passwordHash    Nobody's password travels between databases. People are
//                   invited from /admin/invites and set their own.
//   tokenVersion    A session counter, meaningless in another database.
//   AuditLog        This machine's history, not the university's.
//   StudentClaim    2026 recruitment, decided by завідувачі on the live system.
//   Stake*          The ставка pools and grids are this year's live work.
//   LoginThrottle   Failed logins from a laptop.
//
// The output is gitignored for the same reason `staff-roster.json` is: ~300
// real colleagues, their corporate addresses and their scores.

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    const [divisions, faculties, departments, staff, templates, activities, ratingEntries] =
      await Promise.all([
        prisma.division.findMany({ orderBy: { name: 'asc' } }),
        prisma.faculty.findMany({
          orderBy: { name: 'asc' },
          include: { dean: { select: { email: true } } },
        }),
        prisma.department.findMany({
          orderBy: { name: 'asc' },
          include: { faculty: { select: { name: true } }, head: { select: { email: true } } },
        }),
        prisma.staff.findMany({
          orderBy: { email: 'asc' },
          include: {
            department: { select: { name: true } },
            division: { select: { name: true } },
            partTimeDepartments: { include: { department: { select: { name: true } } } },
          },
        }),
        prisma.ratingTemplate.findMany({
          orderBy: { year: 'asc' },
          include: {
            sections: { orderBy: { number: 'asc' } },
            activityTypes: {
              orderBy: { order: 'asc' },
              include: {
                section: { select: { number: true } },
                verifyingDivision: { select: { name: true, registryKey: true } },
              },
            },
          },
        }),
        prisma.activity.findMany({
          orderBy: { createdAt: 'asc' },
          include: {
            staff: { select: { email: true } },
            activityType: { select: { code: true, template: { select: { year: true } } } },
          },
        }),
        prisma.ratingEntry.findMany({
          orderBy: [{ year: 'asc' }, { staffId: 'asc' }],
          include: { staff: { select: { email: true } } },
        }),
      ]);

    const data: CoreData = {
      exportedAt: new Date().toISOString(),
      divisions: divisions.map((d) => ({
        name: d.name,
        registryKey: d.registryKey,
        canModerateRating: d.canModerateRating,
      })),
      faculties: faculties.map((f) => ({ name: f.name, deanEmail: f.dean?.email ?? null })),
      departments: departments.map((d) => ({
        name: d.name,
        facultyName: d.faculty.name,
        headEmail: d.head?.email ?? null,
      })),
      staff: staff.map((s) => ({
        email: s.email,
        lastName: s.lastName,
        firstName: s.firstName,
        patronymic: s.patronymic,
        phone: s.phone,
        role: s.role,
        isNpp: s.isNpp,
        isSystem: s.isSystem,
        archivedAt: iso(s.archivedAt),
        archiveReason: s.archiveReason,
        employmentRate: s.employmentRate,
        pedagogicalExperience: s.pedagogicalExperience,
        academicRank: s.academicRank,
        scientificDegree: s.scientificDegree,
        degreeMatchesDepartment: s.degreeMatchesDepartment,
        degreeDefenceDate: iso(s.degreeDefenceDate),
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
        departmentName: s.department?.name ?? null,
        divisionName: s.division?.name ?? null,
        partTimeDepartmentNames: s.partTimeDepartments.map((p) => p.department.name),
      })),
      templates: templates.map((t) => ({
        year: t.year,
        name: t.name,
        isActive: t.isActive,
        status: t.status,
        closedAt: iso(t.closedAt),
        sections: t.sections.map((s) => ({ number: s.number, title: s.title })),
        activityTypes: t.activityTypes.map((a) => ({
          code: a.code,
          label: a.label,
          sectionNumber: a.section.number,
          order: a.order,
          itemNumber: a.itemNumber,
          maxPerYear: a.maxPerYear,
          evidenceFields: a.evidenceFields,
          scoring: a.scoring,
          coefficient: a.coefficient,
          coefficientNote: a.coefficientNote,
          inputSource: a.inputSource,
          verifyingDivisionName: a.verifyingDivision?.name ?? null,
          isActive: a.isActive,
          requiresVerification: a.requiresVerification,
          entityFirstEntry: a.entityFirstEntry,
          licencePositions: a.licencePositions,
        })),
      })),
      activities: activities.map((a) => ({
        staffEmail: a.staff.email,
        typeYear: a.activityType.template.year,
        typeCode: a.activityType.code,
        year: a.year,
        evidence: a.evidence,
        computedValue: a.computedValue,
        score: a.score,
        status: a.status,
        submittedByRole: a.submittedByRole,
        approvedAt: iso(a.approvedAt),
        removedAt: iso(a.removedAt),
        removeReason: a.removeReason,
        verifiedAt: iso(a.verifiedAt),
        createdAt: iso(a.createdAt)!,
      })),
      ratingEntries: ratingEntries.map((r) => ({
        staffEmail: r.staff.email,
        year: r.year,
        section1Score: r.section1Score,
        section2Score: r.section2Score,
        section3Score: r.section3Score,
        section4Score: r.section4Score,
        section5Score: r.section5Score,
        totalScore: r.totalScore,
        snapshot: r.snapshot,
      })),
    };

    writeFileSync(CORE_DATA_FILE, JSON.stringify(data));

    const total = data.ratingEntries.reduce((sum, r) => sum + r.totalScore, 0);
    console.log(`Записано ${CORE_DATA_FILE}\n`);
    console.log(`  відділів:      ${data.divisions.length}`);
    console.log(`  факультетів:   ${data.faculties.length}`);
    console.log(`  кафедр:        ${data.departments.length}`);
    console.log(`  людей:         ${data.staff.length}`);
    console.log(`  адміністрів:   ${data.staff.filter((s) => s.role === 'ADMIN').length}`);
    console.log(`  шаблонів:      ${data.templates.map((t) => t.year).join(', ')}`);
    console.log(
      `  показників:    ${data.templates.reduce((n, t) => n + t.activityTypes.length, 0)}`
    );
    console.log(`  досягнень:     ${data.activities.length}`);
    console.log(`  рейтингів:     ${data.ratingEntries.length}`);
    console.log(`  сума балів:    ${round2(total)}`);
    console.log('\nПаролів у файлі немає — нікого не запросили, ніхто не увійде.');
  } finally {
    await prisma.$disconnect();
  }
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);
const round2 = (n: number) => Math.round(n * 100) / 100;

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
