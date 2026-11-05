import { METRIC_LABELS } from '@/lib/profile-check/labels';
import type { Check } from '@/lib/profile-check/types';

export interface TallyPart {
  /** A `Badge` tone */
  tone: 'ok' | 'destructive' | 'warn';
  text: string;
}

/** Ukrainian plural: 1 помилка, 2–4 помилки, 5+ помилок (11–14 take the last). */
export function plural(n: number, one: string, few: string, many: string): string {
  const last = n % 10;
  const tens = n % 100;
  if (tens >= 11 && tens <= 14) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

/**
 * The tally above the lines: how many checks are fine, wrong, doubtful or only
 * advice. A number such as the h-index is not a verdict and is not counted.
 * Zero counts are left out, so a clean profile reads «6 успішно», not a row of
 * zeros.
 */
export function tally(checks: Check[]) {
  const verdicts = checks.filter((c) => !(c.field in METRIC_LABELS && c.status === 'ok'));
  const n = (s: Check['status']) => verdicts.filter((c) => c.status === s).length;
  const ok = n('ok');
  const errors = n('error');
  const warnings = n('warning');
  const advice = n('info');
  return [
    ok > 0 && { tone: 'ok' as const, text: `${ok} успішно` },
    errors > 0 && {
      tone: 'destructive' as const,
      text: `${errors} ${plural(errors, 'помилка', 'помилки', 'помилок')}`,
    },
    warnings > 0 && {
      tone: 'warn' as const,
      text: `${warnings} ${plural(warnings, 'попередження', 'попередження', 'попереджень')}`,
    },
    advice > 0 && {
      tone: 'warn' as const,
      text: `${advice} ${plural(advice, 'рекомендація', 'рекомендації', 'рекомендацій')}`,
    },
  ].filter((x): x is TallyPart => Boolean(x));
}
