'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { diffChanges } from '@/lib/audit';
import { logError } from '@/lib/log';
import { requireAdmin } from '@/lib/permissions';
import { executeRun, startRun, STALE_MS } from '@/lib/profile-check/job';
import { listPeopleToCheck } from '@/lib/profile-check/people';
import { checkPerson } from '@/lib/profile-check/run';
import { saveResult } from '@/lib/profile-check/store';

export type RunState = {
  id: string;
  status: 'RUNNING' | 'DONE' | 'FAILED';
  done: number;
  total: number;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
} | null;

/** The latest run, read by the page and polled by the progress bar. */
export async function getRunState(): Promise<RunState> {
  const session = await requireAdmin();
  if (!session) return null;

  const run = await db.profileCheckRun.findFirst({ orderBy: { startedAt: 'desc' } });
  if (!run) return null;

  // A run that stopped beating is dead whatever its row still says
  const dead = run.status === 'RUNNING' && Date.now() - run.heartbeatAt.getTime() > STALE_MS;
  return {
    id: run.id,
    status: dead ? 'FAILED' : run.status,
    done: run.done,
    total: run.total,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    error: dead ? 'Перервано: сервер було перезапущено' : run.error,
  };
}

/**
 * Starts a run and returns at once; the run goes on in the server process and
 * the page polls `getRunState`. See lib/profile-check/job.ts for why there is
 * no queue.
 */
export async function startProfileCheck(): Promise<{ error: string } | { success: true }> {
  const session = await requireAdmin();
  if (!session) return { error: 'Недостатньо прав' };

  let started;
  try {
    started = await startRun(db, session.user.staffId ?? null);
  } catch (e) {
    logError('profileCheck.startProfileCheck', e, { userId: session.user.id });
    return { error: 'Не вдалося почати перевірку' };
  }
  if (!started.ok) {
    return {
      error:
        started.reason === 'running'
          ? 'Перевірка вже виконується'
          : 'Немає кого перевіряти: ні в кого не вказано профілів',
    };
  }

  try {
    await db.auditLog.create({
      data: {
        action: 'CREATE',
        entity: 'ProfileCheckRun',
        entityId: started.runId,
        label: 'Перевірка профілів',
        userId: session.user.id,
        changes: diffChanges({}, { total: started.people.length }),
      },
    });
  } catch (e) {
    // The run is already going; a missing audit line must not stop it
    logError('profileCheck.audit', e, { userId: session.user.id });
  }

  // Deliberately not awaited: the run outlives this request
  void executeRun(db, started.runId, started.people);

  revalidatePath('/admin/profile-check');
  return { success: true };
}

/** One person again — after they fixed their ORCID, without a whole run. */
export async function recheckPerson(
  staffId: string
): Promise<{ error: string } | { success: true }> {
  const session = await requireAdmin();
  if (!session) return { error: 'Недостатньо прав' };

  try {
    const [person] = await listPeopleToCheck(db, { staffId });
    if (!person) return { error: 'У цієї людини немає профілів для перевірки' };
    await saveResult(db, await checkPerson(person));
  } catch (e) {
    logError('profileCheck.recheckPerson', e, { userId: session.user.id, staffId });
    return { error: 'Не вдалося перевірити. Спробуйте ще раз' };
  }

  revalidatePath('/admin/profile-check');
  return { success: true };
}
