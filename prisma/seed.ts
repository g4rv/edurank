import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import bcrypt from 'bcryptjs';
import {
  ACTIVITY_TYPES_2026,
  RATING_DIVISIONS,
  SECTION_TITLES,
} from '../lib/rating/activity-types';

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function main() {
  // ─── Divisions ────────────────────────────────────────────────────────────

  const nnv = await prisma.division.upsert({
    where: { name: 'Навчально-науковий відділ' },
    update: {},
    create: { name: 'Навчально-науковий відділ' },
  });

  // Rating divisions (Phase 2) — creates all 6, incl. the two new 2026 ones
  // (відділ кадрів, навчальний відділ); keyed by short catalogue keys
  const ratingDivisionIds: Record<string, string> = {};
  for (const [key, name] of Object.entries(RATING_DIVISIONS)) {
    const division = await prisma.division.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    ratingDivisionIds[key] = division.id;
  }

  // ─── Faculty ──────────────────────────────────────────────────────────────

  const faculty = await prisma.faculty.upsert({
    where: { name: 'Факультет інформаційних технологій' },
    update: {},
    create: { name: 'Факультет інформаційних технологій' },
  });

  // ─── Department ───────────────────────────────────────────────────────────

  const department = await prisma.department.upsert({
    where: { name_facultyId: { name: "Кафедра комп'ютерних наук", facultyId: faculty.id } },
    update: {},
    create: { name: "Кафедра комп'ютерних наук", facultyId: faculty.id },
  });

  // ─── Staff (every person, login included — the User model is merged in) ────

  const [adminHash, editorHash, userHash] = await Promise.all([
    bcrypt.hash('admin123', 10),
    bcrypt.hash('editor123', 10),
    bcrypt.hash('user1234', 10),
  ]);

  // ADMIN — pre-activated so db:reset never locks anyone out
  const admin = await prisma.staff.upsert({
    where: { email: 'admin@edurank.local' },
    update: { passwordHash: adminHash, role: 'ADMIN' },
    create: {
      lastName: 'Адміністратор',
      firstName: 'Системи',
      patronymic: '—',
      email: 'admin@edurank.local',
      isNpp: false,
      passwordHash: adminHash,
      role: 'ADMIN',
    },
  });

  // НПП professor (role USER, activated)
  const professor = await prisma.staff.upsert({
    where: { email: 'kovalenko@university.edu.ua' },
    update: { passwordHash: userHash, role: 'USER' },
    create: {
      passwordHash: userHash,
      role: 'USER',
      lastName: 'Коваленко',
      firstName: 'Іван',
      patronymic: 'Петрович',
      email: 'kovalenko@university.edu.ua',
      isNpp: true,
      departmentId: department.id,
      academicRank: 'DOCENT',
      scientificDegree: 'CANDIDATE',
      degreeMatchesDepartment: true,
      employmentRate: 1.0,
      pedagogicalExperience: 15,
      googleScholarUrl: 'https://scholar.google.com/citations?user=example',
      orcidId: '0000-0000-0000-0001',
    },
  });

  // Non-НПП — ННВ employee (EDITOR, activated)
  const editorStaff = await prisma.staff.upsert({
    where: { email: 'editor@university.edu.ua' },
    update: { passwordHash: editorHash, role: 'EDITOR' },
    create: {
      lastName: 'Редакторенко',
      firstName: 'Олена',
      patronymic: 'Іванівна',
      email: 'editor@university.edu.ua',
      isNpp: false,
      divisionId: nnv.id,
      passwordHash: editorHash,
      role: 'EDITOR',
    },
  });

  // ─── Division permissions (ННВ) ───────────────────────────────────────────

  // Field permissions — which Staff fields ННВ editors can edit
  const nnvFields = [
    'academicRank',
    'scientificDegree',
    'degreeMatchesDepartment',
    'pedagogicalExperience',
    'employmentRate',
    'wosUrl',
    'wosCitationCount',
    'scopusUrl',
    'scopusCitationCount',
    'googleScholarUrl',
    'googleScholarCitationCount',
    'orcidId',
  ];

  for (const fieldName of nnvFields) {
    await prisma.divisionFieldPermission.upsert({
      where: { divisionId_fieldName: { divisionId: nnv.id, fieldName } },
      update: {},
      create: { divisionId: nnv.id, fieldName },
    });
  }

  // Entity permissions — ННВ can fully manage staff, departments, and faculties
  const nnvEntityPermissions = [
    { entity: 'STAFF' as const, action: 'CREATE' as const },
    { entity: 'STAFF' as const, action: 'UPDATE' as const },
    { entity: 'STAFF' as const, action: 'DELETE' as const },
    { entity: 'DEPARTMENT' as const, action: 'CREATE' as const },
    { entity: 'DEPARTMENT' as const, action: 'UPDATE' as const },
    { entity: 'DEPARTMENT' as const, action: 'DELETE' as const },
    { entity: 'FACULTY' as const, action: 'CREATE' as const },
    { entity: 'FACULTY' as const, action: 'UPDATE' as const },
    { entity: 'FACULTY' as const, action: 'DELETE' as const },
  ];

  for (const { entity, action } of nnvEntityPermissions) {
    await prisma.divisionEntityPermission.upsert({
      where: { divisionId_entity_action: { divisionId: nnv.id, entity, action } },
      update: {},
      create: { divisionId: nnv.id, entity, action },
    });
  }

  // ─── Rating template 2026 (Phase 2) ───────────────────────────────────────

  const template = await prisma.ratingTemplate.upsert({
    where: { year: 2026 },
    update: { isActive: true },
    create: { year: 2026, name: 'Рейтинг НПП 2026', isActive: true },
  });

  const sectionIds: Record<number, string> = {};
  for (const [number, title] of Object.entries(SECTION_TITLES)) {
    const section = await prisma.ratingSection.upsert({
      where: { templateId_number: { templateId: template.id, number: Number(number) } },
      update: { title },
      create: { templateId: template.id, number: Number(number), title },
    });
    sectionIds[Number(number)] = section.id;
  }

  for (const def of ACTIVITY_TYPES_2026) {
    const data = {
      sectionId: sectionIds[def.section],
      order: def.order,
      label: def.label,
      coefficient: def.coefficient,
      coefficientNote: def.coefficientNote ?? null,
      inputSource: def.inputSource,
      verifyingDivisionId: def.verifyingDivision ? ratingDivisionIds[def.verifyingDivision] : null,
      isActive: true,
    };
    await prisma.activityType.upsert({
      where: { templateId_code: { templateId: template.id, code: def.code } },
      update: data,
      create: { templateId: template.id, code: def.code, ...data },
    });
  }

  const activityTypeCount = await prisma.activityType.count({
    where: { templateId: template.id },
  });

  console.log('\nSeeded (logins live on Staff now):');
  console.log(`  ADMIN   ${admin.email}              password: admin123`);
  console.log(`  EDITOR  ${editorStaff.email}       password: editor123  division: ${nnv.name}`);
  console.log(
    `  USER    ${professor.email}    password: user1234   staff: ${professor.lastName} ${professor.firstName}`
  );
  console.log(`\n  Divisions: ${Object.values(RATING_DIVISIONS).join(', ')}`);
  console.log(`  Faculty: ${faculty.name}`);
  console.log(`  Department: ${department.name}`);
  console.log(
    `  Rating template: ${template.name} (${template.year}, active) — ${activityTypeCount} activity types`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
