import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function main() {
  // ─── Division ──────────────────────────────────────────────────
  const division = await prisma.division.upsert({
    where: { name: 'Навчально-науковий відділ' },
    update: {},
    create: { name: 'Навчально-науковий відділ' },
  });

  // ─── Faculty ───────────────────────────────────────────────────
  const faculty = await prisma.faculty.upsert({
    where: { name: 'Факультет інформаційних технологій' },
    update: {},
    create: { name: 'Факультет інформаційних технологій' },
  });

  // ─── Department ────────────────────────────────────────────────
  const department = await prisma.department.upsert({
    where: { name_facultyId: { name: 'Кафедра комп\'ютерних наук', facultyId: faculty.id } },
    update: {},
    create: {
      name: 'Кафедра комп\'ютерних наук',
      facultyId: faculty.id,
    },
  });

  // ─── Professor ─────────────────────────────────────────────────
  const professor = await prisma.professor.upsert({
    where: { email: 'kovalenko@university.edu.ua' },
    update: {},
    create: {
      lastName: 'Коваленко',
      firstName: 'Іван',
      patronymic: 'Петрович',
      email: 'kovalenko@university.edu.ua',
      departmentId: department.id,
      academicPosition: 'DOCENT',
      academicRank: 'DOCENT',
      scientificDegree: 'CANDIDATE',
      degreeMatchesDepartment: true,
      employmentRate: 1.0,
      pedagogicalExperience: 15,
      googleScholarURL: 'https://scholar.google.com/citations?user=example',
      orcidId: '0000-0000-0000-0001',
    },
  });

  // ─── Users ─────────────────────────────────────────────────────
  const [adminHash, editorHash, userHash] = await Promise.all([
    bcrypt.hash('admin123', 10),
    bcrypt.hash('editor123', 10),
    bcrypt.hash('user1234', 10),
  ]);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@edurank.local' },
    update: {},
    create: {
      email: 'admin@edurank.local',
      passwordHash: adminHash,
      role: 'ADMIN',
    },
  });

  const editor = await prisma.user.upsert({
    where: { email: 'editor@edurank.local' },
    update: {},
    create: {
      email: 'editor@edurank.local',
      passwordHash: editorHash,
      role: 'EDITOR',
      divisionId: division.id,
    },
  });

  // USER account linked to the professor record above
  const professorUser = await prisma.user.upsert({
    where: { email: 'kovalenko@edurank.local' },
    update: { passwordHash: userHash, role: 'USER', professorId: professor.id },
    create: {
      email: 'kovalenko@edurank.local',
      passwordHash: userHash,
      role: 'USER',
      professorId: professor.id,
    },
  });

  console.log('Seeded:');
  console.log(`  ADMIN   ${admin.email}         password: admin123`);
  console.log(`  EDITOR  ${editor.email}        password: editor123  division: ${division.name}`);
  console.log(`  USER    ${professorUser.email}  password: user1234   professor: ${professor.lastName} ${professor.firstName}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
