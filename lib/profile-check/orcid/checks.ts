/**
 * ORCID record → the university's requirements, one `Check` per field.
 *
 * Ported from `normalizer.py`. Pure: the clock and the person's other links
 * come in as arguments, so every rule is tested without a network.
 */
import {
  CORPORATE_DOMAIN,
  COUNTRY_CODE,
  UNIVERSITY_NAME,
  UNIVERSITY_NAME_UK,
  isUniversityName,
  UNIVERSITY_PROFILE_HOST_PATH,
} from '@/lib/profile-check/config';
import type { Check, CheckStatus } from '@/lib/profile-check/types';
import type { OrcidData } from './extract';

const LATIN_RE = /^[A-Za-z\s\-'.,]+$/;

/** Cyrillic letters drawn exactly like Latin ones — a typing slip worth naming */
const LOOKALIKES: Record<string, string> = {
  а: 'a',
  е: 'e',
  о: 'o',
  р: 'p',
  с: 'c',
  х: 'x',
  і: 'i',
  А: 'A',
  В: 'B',
  Е: 'E',
  О: 'O',
  Р: 'P',
  С: 'C',
  Х: 'X',
  М: 'M',
  Н: 'H',
  Т: 'T',
  К: 'K',
  У: 'Y',
};

const WOS_URL_RE = /webofscience\.com|researcherid\.com|researcher-id\.com/i;
const SCOPUS_URL_RE = /scopus\.com/i;
const GS_URL_RE = /scholar\.google\./i;
const WOS_TYPE_RE = /researcher.?id|rid/i;
const SCOPUS_TYPE_RE = /scopus/i;

function check(
  field: string,
  current: unknown,
  shouldBe: string,
  status: CheckStatus,
  message: string | null = null
): Check {
  return { field, current, shouldBe, status, message };
}

export function checkName(data: OrcidData): Check {
  const should = 'Лише латинські символи';
  const full = `${data.name.given} ${data.name.family}`.trim();
  if (!full) return check('name', null, should, 'error', "Ім'я відсутнє");
  if (LATIN_RE.test(full)) return check('name', full, should, 'ok');
  const folded = [...full].map((c) => LOOKALIKES[c] ?? c).join('');
  if (LATIN_RE.test(folded)) {
    return check(
      'name',
      full,
      should,
      'warning',
      'Містить кириличні символи, схожі на латинські (наприклад «а» замість «a»)'
    );
  }
  return check('name', full, should, 'error', "Ім'я містить не латинські символи");
}

/** At least one verified corporate email and at least one personal one. */
export function checkEmail(data: OrcidData): Check {
  const should = `Мінімум 2 email: підтверджений @${CORPORATE_DOMAIN} та особистий`;
  const addresses = data.emails.filter((e) => e.email);
  if (!addresses.length) return check('email', null, should, 'error', 'Жодного email не вказано');

  const corporate = addresses.filter((e) =>
    e.email!.toLowerCase().endsWith(`@${CORPORATE_DOMAIN}`)
  );
  const personal = addresses.filter((e) => !corporate.includes(e));

  const problems: string[] = [];
  if (!corporate.length) problems.push(`немає корпоративного (@${CORPORATE_DOMAIN})`);
  else if (!corporate.some((e) => e.verified))
    problems.push('корпоративний email не підтверджений');
  if (!personal.length) problems.push('немає особистого email');

  if (problems.length) {
    const message = problems.join('; ');
    return check(
      'email',
      addresses.map((e) => e.email),
      should,
      'error',
      message.charAt(0).toUpperCase() + message.slice(1)
    );
  }
  const corp = corporate.find((e) => e.verified)!.email;
  return check('email', [corp, personal[0].email], should, 'ok');
}

/**
 * The university page is always required. The person's other profiles are
 * required on ORCID only when the person gave them; Google Scholar is advice.
 */
export function checkLinks(
  data: OrcidData,
  given: { wos: boolean; scopus: boolean; googleScholar: boolean }
): Check {
  const should =
    'Посилання на профіль університету; WoS ResearcherID, Scopus Author ID, Google Scholar (якщо вказані в системі)';
  const urls = data.linksAndIds.map((l) => l.url).join(' ');
  const types = data.linksAndIds.map((l) => l.type.toLowerCase());
  const affUrls = data.affiliations.map((a) => a.url).join(' ');

  const hasWos = WOS_URL_RE.test(urls) || types.some((t) => WOS_TYPE_RE.test(t));
  const hasScopus = SCOPUS_URL_RE.test(urls) || types.some((t) => SCOPUS_TYPE_RE.test(t));
  const hasGs = GS_URL_RE.test(urls);
  const hasUniPage = `${urls} ${affUrls}`.toLowerCase().includes(UNIVERSITY_PROFILE_HOST_PATH);

  const missing: string[] = [];
  if (!hasUniPage) missing.push(`профіль університету (${UNIVERSITY_PROFILE_HOST_PATH}...)`);
  if (given.wos && !hasWos) missing.push('WoS ResearcherID');
  if (given.scopus && !hasScopus) missing.push('Scopus Author ID');
  const recommended = given.googleScholar && !hasGs ? ['Google Scholar'] : [];

  const current = data.linksAndIds.map((l) => l.url || l.value);
  if (missing.length) {
    const message =
      `Відсутні: ${missing.join(', ')}` +
      (recommended.length ? `; рекомендовано: ${recommended.join(', ')}` : '');
    return check('links_and_ids', current, should, 'error', message);
  }
  if (recommended.length) {
    return check(
      'links_and_ids',
      current,
      should,
      'info',
      `Рекомендовано додати: ${recommended.join(', ')}`
    );
  }
  return check('links_and_ids', current, should, 'ok');
}

export function checkCountry(data: OrcidData): Check {
  const should = `«${COUNTRY_CODE}» (Україна)`;
  if (data.country === COUNTRY_CODE) return check('country', data.country, should, 'ok');
  if (!data.country) return check('country', null, should, 'error', 'Країну не вказано');
  return check(
    'country',
    data.country,
    should,
    'warning',
    `Очікується «${COUNTRY_CODE}», отримано «${data.country}»`
  );
}

/**
 * The ★ must be on a current employment at the university. The star comes from
 * ORCID's website JSON (see `extract.ts`); when it could not be read
 * (`preferred` is null on every entry) the university must still be a current
 * employment and the result says the star was not verified, never that it is
 * fine.
 */
export function checkAffiliations(data: OrcidData): Check {
  const should = `Місце роботи «${UNIVERSITY_NAME}» або «${UNIVERSITY_NAME_UK}» (позначене зіркою ★); рекомендовано: посада, кафедра, дата початку`;
  if (!data.affiliations.length) {
    return check('affiliations', [], should, 'error', 'Немає жодного місця роботи');
  }
  const names = data.affiliations.map((a) => a.name);
  const isUni = (a: { name: string }) => isUniversityName(a.name);
  const uni = data.affiliations.filter(isUni);
  const starKnown = data.affiliations.some((a) => a.preferred !== null);

  if (starKnown) {
    const starred = data.affiliations.filter((a) => a.preferred);
    if (!starred.length) {
      return check(
        'affiliations',
        names,
        should,
        'error',
        uni.length
          ? 'Університет є у списку, але не позначений зіркою (★)'
          : 'Університет не знайдено і не позначено зіркою'
      );
    }
    if (!starred.some(isUni)) {
      return check(
        'affiliations',
        starred[0].name,
        should,
        'error',
        `Зіркою позначено не університет: «${starred[0].name}»`
      );
    }
  } else if (!uni.length) {
    return check(
      'affiliations',
      names,
      should,
      'error',
      'Університет не знайдено серед місць роботи'
    );
  }

  const aff =
    (starKnown ? uni.find((a) => a.preferred && a.current) : undefined) ??
    uni.find((a) => a.current) ??
    uni[0];
  if (!aff.current) {
    return check(
      'affiliations',
      names,
      should,
      'error',
      'Роботу в університеті закінчено — немає чинного місця роботи'
    );
  }

  const current =
    aff.name +
    (aff.role ? ` — ${aff.role}` : '') +
    (aff.department ? `, ${aff.department}` : '') +
    (aff.startDate ? ` (${aff.startDate} – тепер)` : '');

  const tips = [
    !aff.role && 'посада',
    !aff.department && 'кафедра',
    !aff.startDate && 'дата початку',
  ].filter(Boolean);
  const advice = tips.length ? `Рекомендовано заповнити: ${tips.join(', ')}` : null;

  if (starKnown) {
    return check('affiliations', current, should, advice ? 'info' : 'ok', advice);
  }
  const starNote = 'Зірку (★) не вдалося перевірити — перевірте вручну';
  return check(
    'affiliations',
    current,
    should,
    'info',
    advice ? `${advice}. ${starNote}` : starNote
  );
}

export function checkWorks(data: OrcidData, now: Date): Check {
  const year = now.getFullYear();
  const should = `Принаймні 1 публікація; ${year} або ${year - 1} рік`;
  const work = data.mostRecentWork;
  if (!work || !work.title)
    return check('most_recent_work', null, should, 'error', 'Публікацій не знайдено');
  const workYear = Number.parseInt(work.year ?? '', 10);
  if (Number.isNaN(workYear)) {
    return check(
      'most_recent_work',
      work,
      should,
      'warning',
      'Рік публікації відсутній або невірний'
    );
  }
  if (workYear >= year - 1) return check('most_recent_work', work, should, 'ok');
  return check(
    'most_recent_work',
    work,
    should,
    'error',
    `Остання публікація за ${work.year} рік — застаріла (прийнятно: ${year - 1}–${year})`
  );
}

export function checkKeywords(data: OrcidData): Check {
  return data.keywords.length
    ? check('keywords', data.keywords, 'Принаймні 1 запис', 'ok')
    : check('keywords', [], 'Принаймні 1 запис', 'info', 'Рекомендовано додати ключові слова');
}

export function checkEducation(data: OrcidData): Check {
  return data.education.length
    ? check(
        'education',
        data.education.map((e) => e.name),
        'Принаймні 1 запис',
        'ok'
      )
    : check('education', [], 'Принаймні 1 запис', 'info', 'Рекомендовано додати записи про освіту');
}

export function checkProfessionalActivities(data: OrcidData): Check {
  const should = 'Принаймні 1 запис';
  return data.professionalActivities.length
    ? check(
        'professional_activities',
        data.professionalActivities.map((a) => `${a.type}: ${a.name}`),
        should,
        'ok'
      )
    : check(
        'professional_activities',
        [],
        should,
        'info',
        'Рекомендовано додати записи про професійну діяльність'
      );
}

export function runOrcidChecks(
  data: OrcidData,
  given: { wos: boolean; scopus: boolean; googleScholar: boolean },
  now: Date = new Date()
): Check[] {
  return [
    checkName(data),
    checkEmail(data),
    checkLinks(data, given),
    checkCountry(data),
    checkAffiliations(data),
    checkWorks(data, now),
    checkKeywords(data),
    checkEducation(data),
    checkProfessionalActivities(data),
  ];
}
