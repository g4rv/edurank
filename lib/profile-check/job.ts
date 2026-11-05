import type { PrismaClient } from '@/lib/generated/prisma/client';
import { logError } from '@/lib/log';
import { cooldownSecondsLeft } from '@/lib/profile-check/cooldown';
import { needsCheck } from '@/lib/profile-check/pending';
import { listPeopleToCheck } from '@/lib/profile-check/people';
import { checkPeople } from '@/lib/profile-check/run';
import { saveResult } from '@/lib/profile-check/store';
import type { PersonInput, Platform, PlatformChecker } from '@/lib/profile-check/types';

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
  | { ok: false; reason: 'running' | 'nobody' | 'nothing_new' }
  /** The last run of this platform ended less than a minute ago */
  | { ok: false; reason: 'cooling'; secondsLeft: number };

export interface RunScope {
  staffIds?: string[];
  departmentId?: string;
  /** The page's name search */
  q?: string;
  /**
   * Only those with no answer yet (`needsCheck`): never checked, or the last
   * attempt failed. For a platform that refuses a long run part-way — ask the
   * rest later without asking the first ones again.
   */
  onlyMissing?: boolean;
}

export async function startRun(
  client: JobClient,
  startedById: string | null,
  platform: Platform,
  scope: RunScope = {}
): Promise<StartedRun> {
  const alive = new Date(Date.now() - STALE_MS);

  const live = await client.profileCheckRun.findFirst({
    where: { status: 'RUNNING', platform, heartbeatAt: { gt: alive } },
    select: { id: true },
  });
  if (live) return { ok: false, reason: 'running' };

  // A minute between two runs of one platform. A run that never ended (the server
  // died under it) has no end time and so does not count; it is buried below.
  const last = await client.profileCheckRun.findFirst({
    where: { platform, finishedAt: { not: null } },
    orderBy: { finishedAt: 'desc' },
    select: { finishedAt: true },
  });
  const secondsLeft = cooldownSecondsLeft(last?.finishedAt);
  if (secondsLeft > 0) return { ok: false, reason: 'cooling', secondsLeft };

  // A RUNNING row that stopped beating belongs to a process that is gone
  await client.profileCheckRun.updateMany({
    where: { status: 'RUNNING', platform, heartbeatAt: { lte: alive } },
    data: {
      status: 'FAILED',
      finishedAt: new Date(),
      error: 'Перервано: сервер було перезапущено',
    },
  });

  const { onlyMissing, ...who } = scope;
  let people = await listPeopleToCheck(client, who);
  if (people.length === 0) return { ok: false, reason: 'nobody' };

  if (onlyMissing) {
    const stored = await client.profileCheck.findMany({
      where: { platform, staffId: { in: people.map((x) => x.staffId) } },
      select: { staffId: true, status: true },
    });
    const byStaff = new Map(stored.map((r) => [r.staffId, r]));
    people = people.filter((x) => needsCheck(x.links[platform], byStaff.get(x.staffId)));
    if (people.length === 0) return { ok: false, reason: 'nothing_new' };
  }

  const run = await client.profileCheckRun.create({
    data: { platform, total: people.length, startedById },
    select: { id: true },
  });
  return { ok: true, runId: run.id, people };
}

/** Never throws: it runs unattended, so a failure is recorded on the run. */
export async function executeRun(
  client: JobClient,
  runId: string,
  people: PersonInput[],
  platform: Platform,
  {
    concurrency = 4,
    checkers,
  }: { concurrency?: number; checkers?: Record<string, PlatformChecker> } = {}
): Promise<void> {
  // Counted in the loop, not read back: how many of this run could not be asked
  let failed = 0;
  let progressWarned = false;
  try {
    await checkPeople(people, {
      concurrency,
      platforms: [platform],
      checkers,
      onResult: async (result, done) => {
        await saveResult(client, result);
        failed += result.platforms.filter((p) => p.status === 'failed').length;
        // Progress is for the page to show, not part of the work: a run of half an
        // hour must not die because one counter could not be written (a database
        // blip, or a server still running a client from before a column existed —
        // that stopped two Scopus runs after one person on 2026-11-05)
        try {
          await client.profileCheckRun.update({
            where: { id: runId },
            data: { done, failed, heartbeatAt: new Date() },
          });
        } catch (e) {
          if (!progressWarned) {
            progressWarned = true;
            logError('profileCheck.progress', e, { runId });
          }
        }
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
