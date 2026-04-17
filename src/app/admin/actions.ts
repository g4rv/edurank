"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { Prisma } from "@/generated/prisma/client";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

type ActionState = {
  success?: string;
  error?: string;
} | null;

async function requireAdmin() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") redirect("/");
}

// ─── Faculties ────────────────────────────────────────────────

export async function createFaculty(prevState: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();

  const name = (formData.get("name") as string)?.trim();
  if (!name) {
    return { error: "Назва є обов'язковою" };
  }

  try {
    await prisma.faculty.create({ data: { name } });
    revalidatePath("/admin");
    return { success: "Факультет створено" };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "Факультет з такою назвою вже існує" };
    }
    return { error: "Помилка сервера" };
  }
}

export async function deleteFaculty(prevState: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();

  const id = formData.get("id") as string;

  try {
    await prisma.faculty.delete({ where: { id } });
    revalidatePath("/admin");
    return { success: "Факультет видалено" };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return { error: "Неможливо видалити — факультет має кафедри" };
    }
    return { error: "Помилка сервера" };
  }
}

// ─── Departments ──────────────────────────────────────────────

export async function createDepartment(prevState: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();

  const name = (formData.get("name") as string)?.trim();
  const facultyId = formData.get("facultyId") as string;
  if (!name || !facultyId) {
    return { error: "Усі поля є обов'язковими" };
  }

  try {
    await prisma.department.create({ data: { name, facultyId } });
    revalidatePath("/admin");
    return { success: "Кафедру створено" };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "Кафедра з такою назвою вже існує на цьому факультеті" };
    }
    return { error: "Помилка сервера" };
  }
}

export async function deleteDepartment(prevState: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();

  const id = formData.get("id") as string;

  try {
    await prisma.department.delete({ where: { id } });
    revalidatePath("/admin");
    return { success: "Кафедру видалено" };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return { error: "Неможливо видалити — кафедра має викладачів" };
    }
    return { error: "Помилка сервера" };
  }
}

// ─── Professors ───────────────────────────────────────────────

export async function createProfessor(prevState: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();

  const lastName = (formData.get("lastName") as string)?.trim();
  const firstName = (formData.get("firstName") as string)?.trim();
  const patronymic = (formData.get("patronymic") as string)?.trim() || null;
  const departmentId = formData.get("departmentId") as string;

  if (!firstName || !lastName || !departmentId) {
    return { error: "Усі поля є обов'язковими" };
  }

  try {
    await prisma.professor.create({ data: { lastName, firstName, patronymic, departmentId } });
    revalidatePath("/admin");
    return { success: "Викладача створено" };
  } catch (_error) {
    return { error: "Помилка сервера" };
  }
}

export async function deleteProfessor(prevState: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();

  const id = formData.get("id") as string;

  try {
    await prisma.professor.delete({ where: { id } });
    revalidatePath("/admin");
    return { success: "Викладача видалено" };
  } catch (_error) {
    return { error: "Помилка сервера" };
  }
}
