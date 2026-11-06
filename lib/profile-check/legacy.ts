import { worstStatus, type Check, type PlatformStatus } from '@/lib/profile-check/types';

/**
 * Results saved before the rules changed (owner, 2026-11-06). A run takes long,
 * and Google may refuse the next one, so the list reads an old result as the
 * rules read it today instead of waiting for a re-run:
 *
 * - the «Предметні категорії» check of Web of Science and Scopus is gone;
 * - Google Scholar's latest publication is advice, never an error or a warning.
 *
 * Nothing is written back: the next run replaces the row anyway. The platform's
 * status is worked out again only when a check was changed, and only for a
 * result that had checks (`failed` and `no_link` carry none).
 */
const RETIRED_FIELDS: ReadonlySet<string> = new Set(['subject_categories']);

const RECENT_ADVICE = 'Якщо у вас є актуальні публікації, будь ласка, додайте їх до списку';

export function readAsToday(
  status: PlatformStatus,
  checks: Check[]
): { status: PlatformStatus; checks: Check[] } {
  let changed = false;
  const next: Check[] = [];
  for (const c of checks) {
    if (RETIRED_FIELDS.has(c.field)) {
      changed = true;
      continue;
    }
    if (c.field === 'most_recent_work' && (c.status === 'error' || c.status === 'warning')) {
      changed = true;
      next.push({ ...c, status: 'info', message: RECENT_ADVICE });
      continue;
    }
    next.push(c);
  }
  if (!changed) return { status, checks };
  const worked = status === 'ok' || status === 'warning' || status === 'error';
  return { status: worked ? worstStatus(next) : status, checks: next };
}
