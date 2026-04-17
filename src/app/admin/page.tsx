import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { FacultySection } from "./components/faculty-section";
import { DepartmentSection } from "./components/department-section";
import { ProfessorSection } from "./components/professor-section";

// This page queries the database, so it must be rendered dynamically
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") redirect("/");

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
    <main className="flex-1 bg-zinc-50 p-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <FacultySection faculties={faculties} />
        <DepartmentSection departments={departments} faculties={faculties} />
        <ProfessorSection professors={professors} departments={departments} />
      </div>
    </main>
  );
}
