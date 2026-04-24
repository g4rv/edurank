'use server';

import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { Prisma } from '@/generated/prisma/client';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

type ActionState = { success?: string; error?: string } | null;

async function requireAdmin() {
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') redirect('/');
}

export async function createDivision(
  prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireAdmin();

  const name = (formData.get('name') as string)?.trim();
  if (!name) return { error: "Назва є обов'язковою" };

  try {
    await prisma.division.create({ data: { name } });
    revalidatePath('/divisions');
    return { success: 'Відділ створено' };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return { error: 'Відділ з такою назвою вже існує' };
    }
    return { error: 'Помилка сервера' };
  }
}

export async function deleteDivision(
  prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireAdmin();

  const id = formData.get('id') as string;

  try {
    await prisma.division.delete({ where: { id } });
    revalidatePath('/divisions');
    return { success: 'Відділ видалено' };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2003'
    ) {
      return { error: 'Неможливо видалити — відділ має користувачів' };
    }
    return { error: 'Помилка сервера' };
  }
}
