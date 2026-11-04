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
