/**
 * A Web of Science profile → the university's requirements (owner, 2026-11-05):
 * the ORCID on it is the person's own, the name is in Latin letters, the
 * organisation is the university, and the h-index is shown. Pure.
 */
import { UNIVERSITY_NAME, UNIVERSITY_NAME_UK, isUniversityName } from '@/lib/profile-check/config';
import { latinKind } from '@/lib/profile-check/latin';
import type { Check, CheckStatus } from '@/lib/profile-check/types';
import type { WosProfile } from './parse';

function check(
  field: string,
  current: unknown,
  shouldBe: string,
  status: CheckStatus,
  message: string | null = null
): Check {
  return { field, current, shouldBe, status, message };
}

/** `ownOrcid` is what the system holds for the person (canonical), or null. */
export function checkWosOrcid(profile: WosProfile, ownOrcid: string | null): Check {
  const should = 'ORCID у профілі збігається з ORCID у системі';
  if (!profile.orcid) {
    return check('orcid', null, should, 'error', 'У профілі WoS не вказано ORCID');
  }
  if (ownOrcid && profile.orcid !== ownOrcid.toUpperCase()) {
    return check(
      'orcid',
      profile.orcid,
      should,
      'error',
      `ORCID у профілі (${profile.orcid}) не збігається з ORCID у системі (${ownOrcid})`
    );
  }
  return check('orcid', profile.orcid, should, 'ok');
}

export function checkWosName(profile: WosProfile): Check {
  const should = 'Лише латинські символи';
  const kind = latinKind(profile.name);
  if (kind === 'latin') return check('name', profile.name, should, 'ok');
  return check(
    'name',
    profile.name,
    should,
    'error',
    kind === 'lookalike'
      ? 'Містить кириличні символи, схожі на латинські (наприклад «а» замість «a»)'
      : 'Ім’я містить не латинські символи'
  );
}

/**
 * The organisation (and the line under the name) must name the university,
 * in English or Ukrainian; a misspelling is not accepted. Either place is
 * enough, since WoS fills one from the other.
 */
export function checkWosAffiliation(profile: WosProfile): Check {
  const should = `Організація: «${UNIVERSITY_NAME}» або «${UNIVERSITY_NAME_UK}»`;
  const shown = profile.organization ?? profile.affiliation;
  if (!shown) return check('affiliations', null, should, 'error', 'Організацію не вказано');
  const named = [profile.organization, profile.affiliation].some((t) => t && isUniversityName(t));
  if (named) return check('affiliations', shown, should, 'ok');
  return check(
    'affiliations',
    shown,
    should,
    'error',
    `Організація не є університетом: «${shown}»`
  );
}

/** A number, no threshold: the university has not given one. */
export function checkWosHIndex(profile: WosProfile): Check {
  if (profile.hIndex === null) {
    return check(
      'h_index',
      null,
      'Показники профілю',
      'warning',
      'H-індекс не знайдено на сторінці профілю'
    );
  }
  return check('h_index', { all: profile.hIndex }, 'Інформація', 'ok');
}

/**
 * The profile carries its Subject Categories (owner, 2026-11-05) — what its
 * publications are filed under. Missing is an error. If the heading is on the
 * page but no category could be read, that is OUR doubt, not the person's
 * fault: a warning, so a changed page does not flag everyone.
 */
export function checkWosCategories(profile: WosProfile): Check {
  const should = 'У профілі вказано предметні категорії (Subject Categories)';
  if (profile.subjectCategories.length > 0) {
    return check('subject_categories', profile.subjectCategories, should, 'ok');
  }
  if (profile.hasCategoriesSection) {
    return check(
      'subject_categories',
      null,
      should,
      'warning',
      'Не вдалося прочитати предметні категорії зі сторінки профілю'
    );
  }
  return check(
    'subject_categories',
    null,
    should,
    'error',
    'У профілі не вказано предметні категорії'
  );
}
