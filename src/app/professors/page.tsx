import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { POSITION_LABELS, DEGREE_LABELS } from '@/lib/professor-labels';
import type { Prisma } from '@/generated/prisma/client';
import type {
  AcademicRank,
  AcademicPosition,
  ScientificDegree,
} from '@/generated/prisma/enums';
import Filter from './components/filter';

export const dynamic = 'force-dynamic';

// Valid enum value sets for safe URL param parsing
const VALID_RANKS = new Set<string>([
  'DOCENT',
  'PROFESSOR',
  'SENIOR_RESEARCHER',
]);
const VALID_POSITIONS = new Set<string>([
  'ASSISTANT',
  'LECTURER',
  'SENIOR_LECTURER',
  'DOCENT',
  'PROFESSOR',
]);
const VALID_DEGREES = new Set<string>(['CANDIDATE', 'DOCTOR']);

export default async function ProfessorsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    rank?: string;
    position?: string;
    degree?: string;
    department?: string;
    faculty?: string;
    degreeMatch?: string;
  }>;
}) {
  const { q, rank, position, degree, department, faculty, degreeMatch } =
    await searchParams;

  const where: Prisma.ProfessorWhereInput = {};

  if (q?.trim()) {
    where.OR = [
      { lastName: { contains: q.trim(), mode: 'insensitive' } },
      { firstName: { contains: q.trim(), mode: 'insensitive' } },
      { patronymic: { contains: q.trim(), mode: 'insensitive' } },
      { email: { contains: q.trim(), mode: 'insensitive' } },
      { orcidId: { contains: q.trim(), mode: 'insensitive' } },
    ];
  }
  if (rank && VALID_RANKS.has(rank)) {
    where.academicRank = rank as AcademicRank;
  }
  if (position && VALID_POSITIONS.has(position)) {
    where.academicPosition = position as AcademicPosition;
  }
  if (degree && VALID_DEGREES.has(degree)) {
    where.scientificDegree = degree as ScientificDegree;
  }
  if (department) {
    where.departmentId = department;
  }
  if (faculty) {
    where.department = { facultyId: faculty };
  }
  if (degreeMatch === 'true') {
    where.degreeMatchesDepartment = true;
  }

  const [professors, departments, faculties] = await Promise.all([
    prisma.professor.findMany({
      where,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      include: {
        department: {
          select: { name: true, faculty: { select: { name: true } } },
        },
      },
    }),
    prisma.department.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    prisma.faculty.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ]);

  const hasFilters = !!(
    q ||
    rank ||
    position ||
    degree ||
    department ||
    faculty ||
    degreeMatch
  );

  return (
    <main className="flex-1 bg-zinc-50 p-8">
      <div className="mx-auto max-w-7xl">
        <h1 className="mb-6 text-2xl font-semibold text-zinc-900">Викладачі</h1>

        <Filter departments={departments} faculties={faculties} />

        <p className="mt-3 text-sm text-zinc-500">
          {hasFilters
            ? `Знайдено: ${professors.length}`
            : `Всього: ${professors.length}`}
        </p>

        {professors.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500">
            Нікого не знайдено за вказаними фільтрами.
          </p>
        ) : (
          <div className="mt-3 overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50">
                  <th className="px-4 py-3 text-left font-medium text-zinc-600">
                    ПІБ
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-600">
                    Кафедра
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-600">
                    Факультет
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-600">
                    Посада
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-600">
                    Ступінь
                  </th>
                </tr>
              </thead>
              <tbody>
                {professors.map((professor) => (
                  <tr
                    key={professor.id}
                    className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50"
                  >
                    <td className="px-4 py-3 font-medium text-zinc-900">
                      <Link
                        href={`/professors/${professor.id}`}
                        className="hover:text-zinc-600 hover:underline"
                      >
                        {professor.lastName} {professor.firstName}{' '}
                        {professor.patronymic}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-zinc-600">
                      {professor.department.name}
                    </td>
                    <td className="px-4 py-3 text-zinc-500">
                      {professor.department.faculty.name}
                    </td>
                    <td className="px-4 py-3 text-zinc-500">
                      {professor.academicPosition
                        ? POSITION_LABELS[professor.academicPosition]
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-zinc-500">
                      {professor.scientificDegree
                        ? DEGREE_LABELS[professor.scientificDegree]
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
