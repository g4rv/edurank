/**
 * A Google Scholar profile → the university's requirements, one `Check` each.
 *
 * The requirements are those of the reference profile (owner, 2026-11-05):
 * the name carries the person's ORCID, and the description names the university
 * with its ROR link and country; the verified email is the university's and its
 * homepage is the person's page on the university site (2026-11-06). The latest
 * article and the keywords are advice. Pure: the clock and the person's own
 * ORCID come in as arguments.
 */
import {
  CORPORATE_DOMAIN,
  UNIVERSITY_COUNTRY_EN,
  UNIVERSITY_NAME,
  UNIVERSITY_PROFILE_HOST_PATH,
  UNIVERSITY_ROR,
  isUniversityName,
} from '@/lib/profile-check/config';
import { latinKind } from '@/lib/profile-check/latin';
import type { Check, CheckStatus } from '@/lib/profile-check/types';
import type { ScholarProfile } from './parse';

function check(
  field: string,
  current: unknown,
  shouldBe: string,
  status: CheckStatus,
  message: string | null = null
): Check {
  return { field, current, shouldBe, status, message };
}

/** Any ORCID iD written in a text, in canonical form, or null. */
const ORCID_IN_TEXT = /(\d{4}-\d{4}-\d{4}-\d{3}[\dX])/i;
/** The recommended spelling: «(ORCID 0000-0000-0000-0000)», spaces and case free */
const ORCID_SUFFIX = /\(\s*ORCID\s+\d{4}-\d{4}-\d{4}-\d{3}[\dX]\s*\)/i;

const NAME_SHOULD = 'Ім’я латиницею з ORCID: «Ім’я Прізвище (ORCID 0000-0000-0000-0000)»';

/**
 * «Name (ORCID id)»: Latin letters, and the ORCID in it is the person's own.
 * `ownOrcid` is what the system holds for them (canonical, or null) — without
 * it only the presence of an ORCID is checked, nothing to compare to.
 */
export function checkScholarName(profile: ScholarProfile, ownOrcid: string | null): Check {
  const name = profile.name;
  const inName = ORCID_IN_TEXT.exec(name)?.[1].toUpperCase() ?? null;
  // The name itself is what stands outside the brackets
  const plain = name
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const problems: string[] = [];
  if (!inName) {
    problems.push('у імені немає ORCID');
  } else if (ownOrcid && inName !== ownOrcid.toUpperCase()) {
    problems.push(`ORCID в імені (${inName}) не збігається з ORCID у системі (${ownOrcid})`);
  }
  const kind = latinKind(plain);
  if (kind === 'other') problems.push('ім’я не латиницею');
  else if (kind === 'lookalike') problems.push('в імені кириличні літери, схожі на латинські');

  if (problems.length) {
    const text = problems.join('; ');
    return check('name', name, NAME_SHOULD, 'error', text.charAt(0).toUpperCase() + text.slice(1));
  }
  if (!ORCID_SUFFIX.test(name)) {
    return check(
      'name',
      name,
      NAME_SHOULD,
      'info',
      'Рекомендований запис ORCID: «(ORCID 0000-0000-0000-0000)»'
    );
  }
  return check('name', name, NAME_SHOULD, 'ok');
}

/**
 * The newest article is from this year or the last — a RECOMMENDATION, not a
 * requirement (owner, 2026-11-06): whoever has up-to-date publications is asked to
 * add them. The page is read newest first, but the year is taken as the MAX over
 * the rows rather than from the first one, so an article Scholar shows without a
 * year cannot hide the rest.
 */
const RECENT_ADVICE = 'Якщо у вас є актуальні публікації, будь ласка, додайте їх до списку';

export function checkScholarWorks(profile: ScholarProfile, now: Date): Check {
  const year = now.getFullYear();
  const should = `Принаймні 1 публікація; ${year} або ${year - 1} рік`;
  if (profile.articles.length === 0) {
    return check('most_recent_work', null, should, 'info', RECENT_ADVICE);
  }
  const dated = profile.articles.filter((a) => a.year !== null);
  if (dated.length === 0) {
    return check('most_recent_work', null, should, 'info', RECENT_ADVICE);
  }
  const latest = dated.reduce((best, a) => (a.year! > best.year! ? a : best));
  const current = { title: latest.title, year: String(latest.year) };
  if (latest.year! >= year - 1) return check('most_recent_work', current, should, 'ok');
  return check('most_recent_work', current, should, 'info', RECENT_ADVICE);
}

const DESCRIPTION_SHOULD = `Опис: «${UNIVERSITY_NAME} (${UNIVERSITY_ROR}). ${UNIVERSITY_COUNTRY_EN}»`;

/**
 * The description line under the name — the affiliation — names the university,
 * links its ROR record and gives the country. The name and the ROR link are
 * required; the country is advice.
 */
export function checkScholarDescription(profile: ScholarProfile): Check {
  const text = profile.affiliation;
  if (!text) {
    return check('description', null, DESCRIPTION_SHOULD, 'error', 'Опис профілю не заповнено');
  }
  const problems: string[] = [];
  if (!isUniversityName(text)) problems.push('немає назви університету');
  if (!text.toLowerCase().includes(UNIVERSITY_ROR.replace(/^https?:\/\//, '').toLowerCase())) {
    problems.push(`немає посилання ROR (${UNIVERSITY_ROR})`);
  }
  if (problems.length) {
    const msg = `В описі ${problems.join(' і ')}`;
    return check('description', text, DESCRIPTION_SHOULD, 'error', msg);
  }
  if (!/ukraine|україна/i.test(text)) {
    return check(
      'description',
      text,
      DESCRIPTION_SHOULD,
      'info',
      `Рекомендовано вказати країну: ${UNIVERSITY_COUNTRY_EN}`
    );
  }
  return check('description', text, DESCRIPTION_SHOULD, 'ok');
}

const EMAIL_SHOULD = `Підтверджена електронна адреса в ${CORPORATE_DOMAIN}`;

/** «Verified email at uhsp.edu.ua»: the domain is the university's, not another one. */
export function checkScholarVerifiedEmail(profile: ScholarProfile): Check {
  const domain = profile.verifiedDomain;
  if (!domain) {
    return check(
      'verified_email',
      null,
      EMAIL_SHOULD,
      'error',
      'Електронну адресу не підтверджено'
    );
  }
  if (domain !== CORPORATE_DOMAIN && !domain.endsWith(`.${CORPORATE_DOMAIN}`)) {
    return check(
      'verified_email',
      domain,
      EMAIL_SHOULD,
      'error',
      `Підтверджено адресу в ${domain}, потрібна в ${CORPORATE_DOMAIN}`
    );
  }
  return check('verified_email', domain, EMAIL_SHOULD, 'ok');
}

const HOMEPAGE_SHOULD = `Домашня сторінка: особиста сторінка на сайті університету (${UNIVERSITY_PROFILE_HOST_PATH}…)`;

/** The «Homepage» next to the verified email is the person's page on the university site. */
export function checkScholarHomepage(profile: ScholarProfile): Check {
  const link = profile.homepage;
  if (!link) {
    return check('homepage', null, HOMEPAGE_SHOULD, 'error', 'Домашню сторінку не вказано');
  }
  if (!link.toLowerCase().includes(UNIVERSITY_PROFILE_HOST_PATH)) {
    return check(
      'homepage',
      link,
      HOMEPAGE_SHOULD,
      'error',
      'Домашня сторінка — не особиста сторінка на сайті університету'
    );
  }
  return check('homepage', link, HOMEPAGE_SHOULD, 'ok');
}

/** The profile's interests — a recommendation, like ORCID's keywords. */
export function checkScholarKeywords(profile: ScholarProfile): Check {
  return profile.keywords.length
    ? check('keywords', profile.keywords, 'Принаймні 1 ключове слово', 'ok')
    : check(
        'keywords',
        [],
        'Принаймні 1 ключове слово',
        'info',
        'Рекомендовано додати ключові слова'
      );
}
