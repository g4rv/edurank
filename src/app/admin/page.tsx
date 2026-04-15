import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  createFaculty,
  deleteFaculty,
  createDepartment,
  deleteDepartment,
  createProfessor,
  deleteProfessor,
} from "./actions";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") redirect("/");

  const { error } = await searchParams;

  const [faculties, departments, professors] = await Promise.all([
    prisma.faculty.findMany({ orderBy: { name: "asc" } }),
    prisma.department.findMany({
      orderBy: { name: "asc" },
      include: { faculty: { select: { name: true } } },
    }),
    prisma.professor.findMany({
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      include: {
        department: {
          select: { name: true, faculty: { select: { name: true } } },
        },
      },
    }),
  ]);

  return (
    <main className="min-h-screen bg-zinc-50 p-8">
      <div className="mx-auto max-w-3xl space-y-8">
        <h1 className="text-2xl font-semibold text-zinc-900">Панель адміністратора</h1>

        {error && (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
        )}

        {/* ── Faculties ── */}
        <section className="rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="mb-4 text-base font-medium text-zinc-900">Факультети</h2>

          <form action={createFaculty} className="mb-4 flex gap-2">
            <input
              name="name"
              placeholder="Назва факультету"
              required
              className="flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100"
            />
            <button
              type="submit"
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
            >
              Додати
            </button>
          </form>

          {faculties.length === 0 ? (
            <p className="text-sm text-zinc-400">Факультетів ще немає.</p>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {faculties.map((f) => (
                <li key={f.id} className="flex items-center justify-between py-2.5">
                  <span className="text-sm text-zinc-800">{f.name}</span>
                  <form action={deleteFaculty}>
                    <input type="hidden" name="id" value={f.id} />
                    <button type="submit" className="text-sm text-red-500 hover:text-red-700">
                      Видалити
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── Departments ── */}
        <section className="rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="mb-4 text-base font-medium text-zinc-900">Кафедри</h2>

          <form action={createDepartment} className="mb-4 flex gap-2">
            <input
              name="name"
              placeholder="Назва кафедри"
              required
              className="flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100"
            />
            <select
              name="facultyId"
              required
              defaultValue=""
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-700 outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100"
            >
              <option value="" disabled>
                Оберіть факультет
              </option>
              {faculties.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
            >
              Додати
            </button>
          </form>

          {departments.length === 0 ? (
            <p className="text-sm text-zinc-400">Кафедр ще немає.</p>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {departments.map((d) => (
                <li key={d.id} className="flex items-center justify-between py-2.5">
                  <span className="text-sm text-zinc-800">
                    {d.name}{" "}
                    <span className="text-zinc-400">— {d.faculty.name}</span>
                  </span>
                  <form action={deleteDepartment}>
                    <input type="hidden" name="id" value={d.id} />
                    <button type="submit" className="text-sm text-red-500 hover:text-red-700">
                      Видалити
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── Professors ── */}
        <section className="rounded-xl border border-zinc-200 bg-white p-6">
          <h2 className="mb-4 text-base font-medium text-zinc-900">Викладачі</h2>

          <form action={createProfessor} className="mb-4 flex gap-2">
            <input
              name="lastName"
              placeholder="Прізвище"
              required
              className="flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100"
            />
            <input
              name="firstName"
              placeholder="Ім'я"
              required
              className="flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100"
            />
            <input
              name="patronymic"
              placeholder="По батькові"
              className="flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100"
            />
            <select
              name="departmentId"
              required
              defaultValue=""
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-700 outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100"
            >
              <option value="" disabled>
                Оберіть кафедру
              </option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.faculty.name})
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
            >
              Додати
            </button>
          </form>

          {professors.length === 0 ? (
            <p className="text-sm text-zinc-400">Викладачів ще немає.</p>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {professors.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2.5">
                  <span className="text-sm text-zinc-800">
                    {p.lastName} {p.firstName} {p.patronymic}{" "}
                    <span className="text-zinc-400">
                      — {p.department.name}, {p.department.faculty.name}
                    </span>
                  </span>
                  <form action={deleteProfessor}>
                    <input type="hidden" name="id" value={p.id} />
                    <button type="submit" className="text-sm text-red-500 hover:text-red-700">
                      Видалити
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
