import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import bcrypt from 'bcryptjs';
import {
  ACTIVITY_TYPES_2026,
  RATING_DIVISIONS,
  SECTION_TITLES,
} from '../lib/rating/activity-types';
import { syncProfileDerived } from '../lib/rating/profile-derived';
import { dbSpecs } from '../lib/rating/db-specs';
import type { EvidenceField } from '../lib/rating/evidence-fields';
import { parseTypeSpecs } from '../validations/activity-type-spec';
import { computeScore } from '../lib/rating/scoring';
import { recomputeRatingEntry } from '../lib/rating/recompute';
import type { InputSource, Prisma } from '../lib/generated/prisma/client';

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

// Valid demo evidence for any activity type, built from its field specs.
// Validated through the real Zod schema so catalogue drift fails the seed loudly.
function sampleEvidence(fields: readonly EvidenceField[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    switch (f.kind) {
      case 'text':
        out[f.name] = `Демо — ${f.label}`;
        break;
      case 'number':
        out[f.name] = f.name === 'pages' ? 24 : 2;
        break;
      case 'url':
        // Host-restricted links must actually point at an allowed host
        out[f.name] = f.hosts ? `https://${f.hosts[0]}/demo` : 'https://example.com/demo';
        break;
      case 'date':
        out[f.name] = '2026-03-15';
        break;
      case 'isbn':
        out[f.name] = '978-3-16-148410-0';
        break;
      case 'doi':
        out[f.name] = '10.1000/demo.2026';
        break;
      case 'checkbox':
        out[f.name] = true;
        break;
      case 'select':
        out[f.name] = f.options[0].value;
        break;
    }
  }
  return out;
}

// Fills one staff member's 2026 rating: one APPROVED demo activity per active
// type of the given input sources. Idempotent — old demo rows are replaced.
async function seedDemoRating(staffId: string, templateId: string, sources: InputSource[]) {
  const types = await prisma.activityType.findMany({
    where: { templateId, isActive: true, inputSource: { in: sources } },
    select: {
      id: true,
      code: true,
      coefficient: true,
      inputSource: true,
      evidenceFields: true,
      scoring: true,
      template: { select: { year: true } },
    },
  });
  if (types.length === 0) return;
  const year = types[0].template.year;

  await prisma.activity.deleteMany({
    where: { staffId, year, activityType: { inputSource: { in: sources } } },
  });

  for (const type of types) {
    const specs = parseTypeSpecs(type);
    // Validated through the real schema so catalogue drift fails the seed loudly
    const evidence = specs.schema.parse(sampleEvidence(specs.fields));
    const { computedValue, score } = computeScore(
      {
        code: type.code,
        coefficient: type.coefficient,
        scoring: specs.scoring,
        evidenceFields: specs.fields,
      },
      evidence
    );
    await prisma.activity.create({
      data: {
        staffId,
        activityTypeId: type.id,
        year,
        evidence: evidence as Prisma.InputJsonValue,
        computedValue,
        score,
        status: 'APPROVED',
        submittedByRole: type.inputSource === 'DIVISION_MANAGED' ? 'DIVISION' : 'NPP',
        approvedAt: new Date(),
      },
    });
  }

  await recomputeRatingEntry(prisma, staffId, year);
}

async function main() {
  // ─── Divisions ────────────────────────────────────────────────────────────

  // Rating divisions (Phase 2) — all 6, incl. the two new 2026 ones (відділ
  // кадрів, навчальний відділ). Upserted on the catalogue's stable key rather
  // than the name: the name is what an admin may rename on /divisions, and
  // re-seeding after a rename must find the same row instead of trying to
  // create a second one beside it.
  //
  // ННВ is the division that moderates the rating. Its flag is set on update
  // too, so a database seeded before the column arrived does not keep a ННВ
  // that cannot moderate anything.
  const ratingDivisions: Record<string, { id: string; name: string }> = {};
  for (const [key, name] of Object.entries(RATING_DIVISIONS)) {
    const canModerateRating = key === 'NNV';
    const division = await prisma.division.upsert({
      where: { registryKey: key },
      update: { canModerateRating },
      create: { name, registryKey: key, canModerateRating },
    });
    ratingDivisions[key] = { id: division.id, name: division.name };
  }
  const ratingDivisionIds: Record<string, string> = Object.fromEntries(
    Object.entries(ratingDivisions).map(([key, d]) => [key, d.id])
  );
  const nnv = ratingDivisions.NNV;

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
    where: { email: 'admin@edurank.edu' },
    update: { passwordHash: adminHash, role: 'ADMIN' },
    create: {
      lastName: 'Адміністратор',
      firstName: 'Системи',
      patronymic: '—',
      email: 'admin@edurank.edu',
      isNpp: false,
      passwordHash: adminHash,
      role: 'ADMIN',
    },
  });

  // НПП professor (role USER, activated)
  const professor = await prisma.staff.upsert({
    where: { email: 'kovalenko@edurank.edu' },
    update: { passwordHash: userHash, role: 'USER' },
    create: {
      passwordHash: userHash,
      role: 'USER',
      lastName: 'Коваленко',
      firstName: 'Іван',
      patronymic: 'Петрович',
      email: 'kovalenko@edurank.edu',
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
    where: { email: 'editor@edurank.edu' },
    update: { passwordHash: editorHash, role: 'EDITOR' },
    create: {
      lastName: 'Редакторенко',
      firstName: 'Олена',
      patronymic: 'Іванівна',
      email: 'editor@edurank.edu',
      isNpp: false,
      divisionId: nnv.id,
      passwordHash: editorHash,
      role: 'EDITOR',
    },
  });

  // ─── Division permissions (ННВ) ───────────────────────────────────────────

  // Field permissions — which Staff fields ННВ editors can edit.
  // Deliberately excludes employmentRate (confidential) and divisionId (decides
  // editor scope): both are ADMIN-only and setFieldPermission refuses to grant
  // them, so seeding a row here would only create an inert, confusing grant.
  const nnvFields = [
    'academicRank',
    'scientificDegree',
    'degreeMatchesDepartment',
    'pedagogicalExperience',
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
    const specs = dbSpecs(def);
    const data = {
      sectionId: sectionIds[def.section],
      order: def.order,
      label: def.label,
      itemNumber: specs.itemNumber,
      maxPerYear: specs.maxPerYear,
      requiresVerification: specs.requiresVerification,
      evidenceFields: specs.evidenceFields as unknown as Prisma.InputJsonValue,
      scoring: specs.scoring as unknown as Prisma.InputJsonValue,
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

  // ─── Demo НПП with pre-filled ratings ─────────────────────────────────────

  // 1) Only self-reported (NPP_SUBMISSION) achievements; profile-derived fields empty
  const nppDemo = await prisma.staff.upsert({
    where: { email: 'shevchenko@edurank.edu' },
    update: { passwordHash: userHash, role: 'USER' },
    create: {
      passwordHash: userHash,
      role: 'USER',
      lastName: 'Шевченко',
      firstName: 'Марія',
      patronymic: 'Олександрівна',
      email: 'shevchenko@edurank.edu',
      isNpp: true,
      departmentId: department.id,
    },
  });
  await seedDemoRating(nppDemo.id, template.id, ['NPP_SUBMISSION']);

  // 2) Everything filled: full profile (derived indicators), all self-reported
  //    and all division-managed achievements
  const fullDemo = await prisma.staff.upsert({
    where: { email: 'bondarenko@edurank.edu' },
    update: { passwordHash: userHash, role: 'USER' },
    create: {
      passwordHash: userHash,
      role: 'USER',
      lastName: 'Бондаренко',
      firstName: 'Олег',
      patronymic: 'Васильович',
      email: 'bondarenko@edurank.edu',
      isNpp: true,
      departmentId: department.id,
      employmentRate: 1.0,
      pedagogicalExperience: 25,
      academicRank: 'PROFESSOR',
      scientificDegree: 'DOCTOR',
      degreeMatchesDepartment: true,
      adminPosition: 'DEAN',
      basicEducationMatch: true,
      basicEducationSpecialty: "Комп'ютерні науки",
      wosCitationCount: 5,
      scopusCitationCount: 4,
      googleScholarCitationCount: 12,
      wosUrl: 'https://www.webofscience.com/wos/author/record/demo',
      scopusUrl: 'https://www.scopus.com/authid/detail.uri?authorId=demo',
      googleScholarUrl: 'https://scholar.google.com/citations?user=demo',
      orcidId: '0000-0000-0000-0002',
    },
  });
  await seedDemoRating(fullDemo.id, template.id, ['NPP_SUBMISSION', 'DIVISION_MANAGED']);

  // Profile-derived indicators (стаж, звання, посада…) — build the rating rows
  // from the profiles just seeded, same sync the app runs on profile edits.
  const allStaff = await prisma.staff.findMany({ select: { id: true } });
  for (const { id } of allStaff) {
    await syncProfileDerived(prisma, id);
  }

  console.log('\nSeeded (logins live on Staff now):');
  console.log(`  ADMIN   ${admin.email}              password: admin123`);
  console.log(`  EDITOR  ${editorStaff.email}       password: editor123  division: ${nnv.name}`);
  console.log(
    `  USER    ${professor.email}    password: user1234   staff: ${professor.lastName} ${professor.firstName}`
  );
  console.log(`  USER    ${nppDemo.email}   password: user1234   demo: усі самоподання (НПП)`);
  console.log(`  USER    ${fullDemo.email}   password: user1234   demo: увесь рейтинг заповнено`);
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
