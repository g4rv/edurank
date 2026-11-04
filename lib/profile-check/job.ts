import type { PrismaClient } from '@/lib/generated/prisma/client';
import { logError } from '@/lib/log';
import { listPeopleToCheck } from '@/lib/profile-check/people';
import { checkPeople } from '@/lib/profile-check/run';
import { saveResult } from '@/lib/profile-check/store';
import type { PersonInput } from '@/lib/profile-check/types';

/**
 * The run as a background job — no queue, no worker (the same call the bulk
 * invite made: one admin pressing one button does not justify a service).
 *
 * `startRun` writes the run row and returns at once; `executeRun` then goes on
 * in the server process, saving every person as they finish. The process is
 * the only thing alive, so a restart mid-run would leave the row RUNNING for
 * ever. `heartbeatAt` is the answer: every saved person moves it, and a run
 * silent for `STALE_MS` is dead — it is marked FAILED when the next one starts.
 */
export const STALE_MS = 2 * 60 * 1000;

type JobClient = Pick<PrismaClient, '$transaction' | 'staff' | 'profileCheck' | 'profileCheckRun'>;

export type StartedRun =
  | { ok: true; runId: string; people: PersonInput[] }
  | { ok: false; reason: 'running' | 'nobody' };

export interface RunScope {
  staffIds?: string[];
  departmentId?: string;
}

export async function startRun(
  client: JobClient,
  startedById: string | null,
  scope: RunScope = {}
): Promise<StartedRun> {
  const alive = new Date(Date.now() - STALE_MS);

  const live = await client.profileCheckRun.findFirst({
    where: { status: 'RUNNING', heartbeatAt: { gt: alive } },
    select: { id: true },
  });
  if (live) return { ok: false, reason: 'running' };

  // A RUNNING row that stopped beating belongs to a process that is gone
  await client.profileCheckRun.updateMany({
    where: { status: 'RUNNING', heartbeatAt: { lte: alive } },
    data: {
      status: 'FAILED',
      finishedAt: new Date(),
      error: 'Перервано: сервер було перезапущено',
    },
  });

  const people = await listPeopleToCheck(client, scope);
  if (people.length === 0) return { ok: false, reason: 'nobody' };

  const run = await client.profileCheckRun.create({
    data: { total: people.length, startedById },
    select: { id: true },
  });
  return { ok: true, runId: run.id, people };
}

/** Never throws: it runs unattended, so a failure is recorded on the run. */
export async function executeRun(
  client: JobClient,
  runId: string,
  people: PersonInput[],
  { concurrency = 4 }: { concurrency?: number } = {}
): Promise<void> {
  try {
    await checkPeople(people, {
      concurrency,
      onResult: async (result, done) => {
        await saveResult(client, result);
        await client.profileCheckRun.update({
          where: { id: runId },
          data: { done, heartbeatAt: new Date() },
        });
      },
    });
    await client.profileCheckRun.update({
      where: { id: runId },
      data: { status: 'DONE', finishedAt: new Date() },
    });
  } catch (e) {
    logError('profileCheck.executeRun', e, { runId });
    await client.profileCheckRun
      .update({
        where: { id: runId },
        data: {
          status: 'FAILED',
          finishedAt: new Date(),
          error: 'Не вдалося завершити перевірку',
        },
      })
      .catch((inner) => logError('profileCheck.markFailed', inner, { runId }));
  }
}
