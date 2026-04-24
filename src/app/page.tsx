import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { Container } from '@/components/ui';

// This page queries the database, so it must be rendered dynamically (not at build time)
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const professors = await prisma.professor.findMany({
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    include: {
      department: {
        select: {
          name: true,
          faculty: { select: { name: true } },
        },
      },
    },
  });

  return (
    <main className="flex-1 bg-zinc-50 py-8">
      <Container>
        <h1 className="mb-6 text-2xl font-semibold text-zinc-900">Викладачі</h1>

        {professors.length === 0 ? (
          <p className="text-sm text-zinc-500">Викладачів ще немає.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Container>
    </main>
  );
}
