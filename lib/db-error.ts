import { Prisma } from '@/lib/generated/prisma/client';

const UNIQUE_FIELD_MESSAGES: Record<string, string> = {
  email: 'Працівник з таким email вже існує',
  Staff_email_key: 'Працівник з таким email вже існує',
  User_email_key: 'Користувач з таким email вже існує',
};

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
  }
  return fallback;
}
