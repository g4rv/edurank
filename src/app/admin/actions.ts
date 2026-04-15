"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { Prisma } from "@/generated/prisma/client";
import { redirect } from "next/navigation";

async function requireAdmin() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") redirect("/");
}

// ─── Faculties ────────────────────────────────────────────────

export async function createFaculty(formData: FormData) {
  await requireAdmin();

  const name = (formData.get("name") as string)?.trim();
  if (!name) redirect("/admin?error=Назва+є+обов%27язковою");

  try {
    await prisma.faculty.create({ data: { name } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      redirect("/admin?error=Факультет+з+такою+назвою+вже+існує");
    }
    throw error;
  }

  redirect("/admin");
}

export async function deleteFaculty(formData: FormData) {
  await requireAdmin();

  const id = formData.get("id") as string;

  try {
    await prisma.faculty.delete({ where: { id } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      redirect("/admin?error=Неможливо+видалити+—+факультет+має+кафедри");
    }
    throw error;
  }

  redirect("/admin");
}

// ─── Departments ──────────────────────────────────────────────

export async function createDepartment(formData: FormData) {
  await requireAdmin();

  const name = (formData.get("name") as string)?.trim();
  const facultyId = formData.get("facultyId") as string;
  if (!name || !facultyId) redirect("/admin?error=Усі+поля+є+обов%27язковими");

  try {
    await prisma.department.create({ data: { name, facultyId } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      redirect("/admin?error=Кафедра+з+такою+назвою+вже+існує+на+цьому+факультеті");
    }
    throw error;
  }

  redirect("/admin");
}

export async function deleteDepartment(formData: FormData) {
  await requireAdmin();

  const id = formData.get("id") as string;

  try {
    await prisma.department.delete({ where: { id } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      redirect("/admin?error=Неможливо+видалити+—+кафедра+має+викладачів");
    }
    throw error;
  }

  redirect("/admin");
}

// ─── Professors ───────────────────────────────────────────────

export async function createProfessor(formData: FormData) {
  await requireAdmin();

  const lastName = (formData.get("lastName") as string)?.trim();
  const firstName = (formData.get("firstName") as string)?.trim();
  const patronymic = (formData.get("patronymic") as string)?.trim() || null;
  const departmentId = formData.get("departmentId") as string;
  if (!firstName || !lastName || !departmentId) redirect("/admin?error=Усі+поля+є+обов%27язковими");

  await prisma.professor.create({ data: { lastName, firstName, patronymic, departmentId } });
  redirect("/admin");
}

export async function deleteProfessor(formData: FormData) {
  await requireAdmin();

  const id = formData.get("id") as string;
  await prisma.professor.delete({ where: { id } });
  redirect("/admin");
}
