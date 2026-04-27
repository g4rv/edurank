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

export async function createFaculty(
  prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireAdminOrEditor();

  const name = (formData.get('name') as string)?.trim();
  if (!name) return { error: "Назва є обов'язковою" };

  try {
    await prisma.faculty.create({ data: { name } });
    revalidatePath('/faculties');
    return { success: 'Факультет створено' };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return { error: 'Факультет з такою назвою вже існує' };
    }
    return { error: 'Помилка сервера' };
  }
}

export async function deleteFaculty(id: string): Promise<{ error?: string }> {
  await requireAdminOrEditor();

  try {
    await prisma.faculty.delete({ where: { id } });
    revalidatePath('/faculties');
    return {};
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2003'
    ) {
      return { error: 'Неможливо видалити — факультет має кафедри' };
    }
    return { error: 'Помилка сервера' };
  }
}
