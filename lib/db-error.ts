import { Prisma } from '@/lib/generated/prisma/client';
import { logError, type LogContext } from '@/lib/log';

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

/**
 * Turns a write failure into something the person can read.
 *
 * Two kinds of failure, treated differently on purpose:
 *
 * - **Expected** — P2002/P2025/P2003 mean the person did something the data
 *   does not allow (that email is taken, the record is gone). They get a
 *   specific message and nothing is logged: it is not a defect, and logging it
 *   would bury the real ones.
 * - **Unexpected** — anything else is a bug, a broken connection or bad data.
 *   It is logged with its stack, and the returned message carries the log's id
 *   so a support report can be traced to the exact entry.
 *
 * `scope` names the operation for the log («staff.archive»). It is optional so
 * that a call site which has not been updated still logs, just less usefully.
 */
export function parseDbError(
  err: unknown,
  fallback = 'Помилка при збереженні',
  scope = 'db',
  context: LogContext = {}
): string {
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

  const id = logError(scope, err, context);
  return `${fallback} (код ${id})`;
}
