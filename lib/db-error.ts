import { Prisma } from '@/lib/generated/prisma/client';

const UNIQUE_FIELD_MESSAGES: Record<string, string> = {
  Staff_email_key: 'Працівник з таким email вже існує',
  User_email_key: 'Користувач з таким email вже існує',
};

/**
 * A unique-constraint violation (P2002). Worth distinguishing from other write
 * failures because it is sometimes a lost race rather than bad input: two
 * editors saving the same division cell both find no row and both insert, and
 * the loser can simply take the update path instead of being shown an error.
 */
export function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

export function parseDbError(err: unknown, fallback = 'Помилка при збереженні'): string {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = (err.meta?.target as string[] | string | undefined) ?? [];
      const fields = Array.isArray(target) ? target : [target];
      for (const field of fields) {
        if (UNIQUE_FIELD_MESSAGES[field]) return UNIQUE_FIELD_MESSAGES[field];
      }
      return 'Запис з такими даними вже існує';
    }
    if (err.code === 'P2025') return 'Запис не знайдено';
    if (err.code === 'P2003') return 'Вказаний запис не існує';
  }
  return fallback;
}
