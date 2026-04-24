'use server';

import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { Prisma } from '@/generated/prisma/client';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

type ActionState = { success?: string; error?: string } | null;

async function requireAdminOrEditor() {
  const session = await auth();
  if (!session || !['ADMIN', 'EDITOR'].includes(session.user.role))
    redirect('/');
}

export async function createDepartment(
  prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireAdminOrEditor();

  const name = (formData.get('name') as string)?.trim();
  const facultyId = formData.get('facultyId') as string;
  if (!name || !facultyId) return { error: "Усі поля є обов'язковими" };

  try {
    await prisma.department.create({ data: { name, facultyId } });
    revalidatePath('/departments');
    return { success: 'Кафедру створено' };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return { error: 'Кафедра з такою назвою вже існує на цьому факультеті' };
    }
    return { error: 'Помилка сервера' };
  }
}

export async function deleteDepartment(
  prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireAdminOrEditor();

  const id = formData.get('id') as string;

  try {
    await prisma.department.delete({ where: { id } });
    revalidatePath('/departments');
    return { success: 'Кафедру видалено' };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2003'
    ) {
      return { error: 'Неможливо видалити — кафедра має викладачів' };
    }
    return { error: 'Помилка сервера' };
  }
}
