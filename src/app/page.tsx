import { prisma } from "@/lib/prisma";

// This page queries the database, so it must be rendered dynamically (not at build time)
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const professors = await prisma.professor.findMany({
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
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
    <main className="min-h-screen bg-zinc-50 p-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-6 text-2xl font-semibold text-zinc-900">Викладачі</h1>

        {professors.length === 0 ? (
          <p className="text-sm text-zinc-500">Викладачів ще немає.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50">
                  <th className="px-4 py-3 text-left font-medium text-zinc-600">ПІБ</th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-600">Кафедра</th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-600">Факультет</th>
                </tr>
              </thead>
              <tbody>
                {professors.map((professor) => (
                  <tr key={professor.id} className="border-b border-zinc-100 last:border-0">
                    <td className="px-4 py-3 text-zinc-900">
                      {professor.lastName} {professor.firstName} {professor.patronymic}
                    </td>
                    <td className="px-4 py-3 text-zinc-600">{professor.department.name}</td>
                    <td className="px-4 py-3 text-zinc-500">{professor.department.faculty.name}</td>
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
