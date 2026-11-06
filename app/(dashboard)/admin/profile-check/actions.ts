'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { logError, logWarning } from '@/lib/log';
import { requireAdmin } from '@/lib/permissions';
import { executeRun, startRun, STALE_MS, type RunScope } from '@/lib/profile-check/job';
import { PLATFORM_LABELS } from '@/lib/profile-check/labels';
import { listPeopleToCheck } from '@/lib/profile-check/people';
import { CHECKERS } from '@/lib/profile-check/platforms';
import { checkPerson } from '@/lib/profile-check/run';
import { saveResult } from '@/lib/profile-check/store';
import { PLATFORMS, type Platform } from '@/lib/profile-check/types';
import { listProfileChecks } from '@/lib/queries/list-profile-checks';

export type RunState = {
  id: string;
  status: 'RUNNING' | 'DONE' | 'FAILED';
  done: number;
  /** How many of `done` could not be asked; their earlier results were kept */
  failed: number;
  total: number;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  /** Requests this run sent */
  requests: number;
  /** Requests every run of this platform sent in the last 7 days */
  requestsWeek: number;
  /** What the site says of its own limit (Elsevier), while that window is open */
  quota: { limit: number; remaining: number; resetAt: string } | null;
} | null;

export type RunStates = Record<Platform, RunState>;

/**
 * What a platform has used: the requests of the last seven days, and the quota the
 * site last reported about itself (only while that window is still open — after
 * its reset the figure says nothing). Read apart from the run and never allowed
 * to break the page: a server still running a database client from before these
 * columns existed answers with zeros rather than an error.
 */
async function usageOf(
  platform: Platform
): Promise<{ requestsWeek: number; quota: NonNullable<RunState>['quota'] }> {
  try {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [sum, last] = await Promise.all([
      db.profileCheckRun.aggregate({
        _sum: { requests: true },
        where: { platform, startedAt: { gte: weekAgo } },
      }),
      db.profileCheckRun.findFirst({
        where: { platform, quotaRemaining: { not: null } },
        orderBy: { startedAt: 'desc' },
        select: { quotaLimit: true, quotaRemaining: true, quotaResetAt: true },
      }),
    ]);
    const open = last?.quotaResetAt && last.quotaResetAt.getTime() > Date.now() ? last : null;
    return {
      requestsWeek: sum._sum.requests ?? 0,
      quota:
        open && open.quotaLimit !== null && open.quotaRemaining !== null && open.quotaResetAt
          ? {
              limit: open.quotaLimit,
              remaining: open.quotaRemaining,
              resetAt: open.quotaResetAt.toISOString(),
            }
          : null,
    };
  } catch (e) {
    warnUsageOnce(e);
    return { requestsWeek: 0, quota: null };
  }
}

/**
 * A missing usage figure blocks nobody, so it is a warning, not an error — and a
 * page that asks for four platforms on every load must not say it four times.
 * One line a minute. (Typically a server still running a database client from
 * before the columns existed: it needs a restart, and says so.)
 */
let usageWarnedAt = 0;
function warnUsageOnce(e: unknown) {
  if (Date.now() - usageWarnedAt < 60_000) return;
  usageWarnedAt = Date.now();
  // Prisma's message begins with a blank line: take the first line that says something
  const first = String(e instanceof Error ? e.message : e)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find(Boolean);
  logWarning(
    'profileCheck.usage',
    `the usage figures could not be read (restart the server if the schema just changed): ${first ?? ''}`
  );
}

/**
 * The latest run of every platform, read by the page and polled by the
 * progress bars. A run made before the platforms were separate (`all`) counts
 * as the last one for each of them until they have one of their own.
 */
export async function getRunStates(): Promise<RunStates | null> {
  const session = await requireAdmin();
  if (!session) return null;

  const states = {} as RunStates;
  for (const platform of PLATFORMS) {
    const run = await db.profileCheckRun.findFirst({
      where: { platform: { in: [platform, 'all'] } },
      orderBy: { startedAt: 'desc' },
    });
    if (!run) {
      states[platform] = null;
      continue;
    }
    // A run that stopped beating is dead whatever its row still says
    const dead = run.status === 'RUNNING' && Date.now() - run.heartbeatAt.getTime() > STALE_MS;
    const usage = await usageOf(platform);
    states[platform] = {
      id: run.id,
      status: dead ? 'FAILED' : run.status,
      done: run.done,
      failed: run.failed,
      total: run.total,
      startedAt: run.startedAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString() ?? null,
      error: dead ? 'Перервано: сервер було перезапущено' : run.error,
      requests: run.requests ?? 0,
      ...usage,
    };
  }
  return states;
}

/**
 * Starts the check of ONE platform and returns at once; the run goes on in the
 * server process and the page polls `getRunStates`. See lib/profile-check/job.ts
 * for why there is no queue.
 *
 * Platforms run apart (owner, 2026-11-04) because their speeds do not compare —
 * Scholar is spaced to about two seconds a person, ORCID is not — and so a
 * block by one site never holds back another. Two runs of the SAME platform
 * never overlap; different platforms may.
 */
export type RunMode = 'missing' | 'all';

export async function startProfileCheck(
  platform: string,
  filter: { department?: string; onlyProblems?: boolean; q?: string } = {},
  mode: RunMode = 'all'
): Promise<{ error: string } | { success: true }> {
  const session = await requireAdmin();
  if (!session) return { error: 'Недостатньо прав' };

  if (!(PLATFORMS as readonly string[]).includes(platform)) {
    return { error: 'Невідома платформа' };
  }
  const target = platform as Platform;
  if (!CHECKERS[target].implemented) {
    return { error: 'Правила для цієї платформи ще не задані' };
  }

  const departmentId =
    typeof filter.department === 'string' && filter.department ? filter.department : undefined;
  const onlyProblems = filter.onlyProblems === true;
  const q = typeof filter.q === 'string' && filter.q.trim() ? filter.q.trim() : undefined;

  let started;
  try {
    // The run covers what the page's filters show, resolved here — the browser
    // only says which filters, never which people
    // «missing»: only those with no answer yet — see lib/profile-check/pending.ts
    const scope: RunScope = { departmentId, q, onlyMissing: mode === 'missing' };
    if (onlyProblems) {
      // «Problems» here are the problems of THIS platform
      const rows = await listProfileChecks({ departmentId, q });
      const ids = rows.filter((r) => r.problemPlatforms.includes(target)).map((r) => r.staffId);
      if (ids.length === 0) return { error: 'За цим фільтром немає кого перевіряти' };
      scope.staffIds = ids;
    }
    started = await startRun(db, session.user.staffId ?? null, target, scope);
  } catch (e) {
    logError('profileCheck.startProfileCheck', e, { userId: session.user.id, platform });
    return { error: 'Не вдалося почати перевірку' };
  }
  if (!started.ok) {
    if (started.reason === 'cooling') {
      return {
        error: `Зачекайте ще ${started.secondsLeft} с: між перевірками однієї платформи має минути хвилина`,
      };
    }
    return {
      error:
        started.reason === 'running'
          ? `Перевірка ${PLATFORM_LABELS[target]} вже виконується`
          : started.reason === 'nothing_new'
            ? 'Усіх уже перевірено — немає кого перевіряти'
            : 'Немає кого перевіряти: ні в кого не вказано профілів',
    };
  }

  // Deliberately not awaited: the run outlives this request
  void executeRun(db, started.runId, started.people, target);

  revalidatePath('/admin/profile-check');
  return { success: true };
}

/**
 * One person again, on every platform that is checked — after they fixed their
 * ORCID, without a whole run. Scholar goes through its gate like any other
 * request, so this takes a couple of seconds.
 */
export async function recheckPerson(
  staffId: string
): Promise<{ error: string } | { success: true }> {
  const session = await requireAdmin();
  if (!session) return { error: 'Недостатньо прав' };

  try {
    const [person] = await listPeopleToCheck(db, { staffId });
    if (!person) return { error: 'У цієї людини немає профілів для перевірки' };
    const platforms = PLATFORMS.filter((p) => CHECKERS[p].implemented);
    const { kept } = await saveResult(db, await checkPerson(person, { platforms }));
    if (kept.length > 0) {
      // Not a success: the page would show the OLD result under a fresh click
      revalidatePath('/admin/profile-check');
      return {
        error: `Не вдалося перевірити: ${kept.map((k) => PLATFORM_LABELS[k]).join(', ')}. Попередні дані збережено`,
      };
    }
  } catch (e) {
    logError('profileCheck.recheckPerson', e, { userId: session.user.id, staffId });
    return { error: 'Не вдалося перевірити. Спробуйте ще раз' };
  }

  revalidatePath('/admin/profile-check');
  return { success: true };
}
