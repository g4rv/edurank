import { randomBytes } from 'crypto';

/**
 * Server-side error logging.
 *
 * Until this existed, a failing action did `catch (e) → parseDbError(e)` and
 * threw the error away: the person saw «Помилка при збереженні» and nobody,
 * anywhere, had the stack. The audit log records every successful mutation in
 * detail; failures recorded nothing at all.
 *
 * Output goes to stdout/stderr as one JSON line, because that is what the
 * container runtime already collects — `docker compose logs`, or Coolify's log
 * view, with no extra service to run or pay for. The stack follows on its own
 * lines; a collector keeps it with the entry above it.
 *
 * Every entry carries a short **id**, which is also shown to the person who hit
 * the error («Помилка при збереженні (код 7f3a2b19)»). That is the whole point:
 * when someone says «I cannot save», the code they read out finds the exact
 * stack in the log. Without it, the report is unactionable.
 */

export interface LogContext {
  /** Who was doing it — never a password hash or anything confidential */
  userId?: string;
  /** What it was about, e.g. the record's id */
  entityId?: string;
  [key: string]: unknown;
}

/** Short, readable, and unique enough to grep out of one deployment's logs */
function errorId(): string {
  return randomBytes(4).toString('hex');
}

/**
 * Logs an unexpected failure and returns the id to show the user.
 *
 * `scope` names the operation, not the file: «staff.archive», «rating.close».
 * It is what you grep for when a report is «archiving is broken» rather than
 * «I saw code 7f3a2b19».
 */
export function logError(scope: string, error: unknown, context: LogContext = {}): string {
  const id = errorId();
  const err = error instanceof Error ? error : new Error(String(error));

  // Prisma's known errors carry a code and meta that say far more than the
  // message does — P2002 plus its target is the difference between «write
  // failed» and «that email is taken».
  const { code, meta } = err as { code?: unknown; meta?: unknown };

  console.error(
    JSON.stringify({
      level: 'error',
      at: new Date().toISOString(),
      id,
      scope,
      message: err.message,
      ...(typeof code === 'string' ? { code } : {}),
      ...(meta ? { meta } : {}),
      ...context,
    })
  );
  if (err.stack) console.error(err.stack);

  return id;
}

/**
 * Something went wrong but the user is not blocked and no id is needed — a
 * failed invite email, a profile backfill that did not run. Worth knowing about
 * when a pattern forms; not worth a code on screen.
 */
export function logWarning(scope: string, message: string, context: LogContext = {}): void {
  console.warn(
    JSON.stringify({ level: 'warn', at: new Date().toISOString(), scope, message, ...context })
  );
}
