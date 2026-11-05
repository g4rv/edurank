import type { CheckStatus, Platform, PlatformStatus } from '@/lib/profile-check/types';

export const PLATFORM_LABELS: Record<Platform, string> = {
  orcid: 'ORCID',
  wos: 'Web of Science',
  scopus: 'Scopus',
  googleScholar: 'Google Scholar',
};

export const PLATFORM_STATUS_LABELS: Record<PlatformStatus, string> = {
  ok: 'Гаразд',
  warning: 'Увага',
  error: 'Помилки',
  failed: 'Не вдалося',
  no_link: 'Немає',
  not_implemented: 'Не перевіряється',
};

export const CHECK_STATUS_LABELS: Record<CheckStatus, string> = {
  ok: 'Гаразд',
  info: 'Порада',
  warning: 'Увага',
  error: 'Помилка',
};

/** Field names of an ORCID check, as a person reads them */
export const CHECK_FIELD_LABELS: Record<string, string> = {
  profile: 'Профіль',
  description: 'Опис профілю',
  name: "Ім'я",
  email: 'Email',
  links_and_ids: 'Посилання та ідентифікатори',
  country: 'Країна',
  affiliations: 'Місце роботи',
  most_recent_work: 'Остання публікація',
  keywords: 'Ключові слова',
  education: 'Освіта',
  professional_activities: 'Професійна діяльність',
};

/**
 * Checks that carry a number rather than a verdict — shown as «label: value»
 * lines under the platform, not as problems. The value is `{ all, recent }`
 * (all time, and the last five years — Scholar's own two columns).
 */
export const METRIC_LABELS: Record<string, string> = {
  h_index: 'h-індекс',
  citations: 'Цитування',
  i10_index: 'i10-індекс',
};

/** The «all time» value of a metric check, or null when it has none. */
export function metricAll(check: { current: unknown } | undefined): number | null {
  const v = (check?.current as { all?: unknown } | null | undefined)?.all;
  return typeof v === 'number' ? v : null;
}
