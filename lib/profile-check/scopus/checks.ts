/**
 * A Scopus author → the university's requirements (owner, 2026-11-05): the same
 * as for Web of Science — the ORCID on the profile is the person's own, the name
 * is Latin, the current affiliation is the university, the profile carries its
 * subject areas — and the h-index is shown. Pure.
 */
import { UNIVERSITY_NAME, UNIVERSITY_NAME_UK, isUniversityName } from '@/lib/profile-check/config';
import { latinKind } from '@/lib/profile-check/latin';
import type { Check, CheckStatus } from '@/lib/profile-check/types';
import type { ScopusProfile } from './parse';

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
export function checkScopusOrcid(profile: ScopusProfile, ownOrcid: string | null): Check {
  const should = 'ORCID у профілі збігається з ORCID у системі';
  if (!profile.orcid) {
    return check('orcid', null, should, 'error', 'У профілі Scopus не вказано ORCID');
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

export function checkScopusName(profile: ScopusProfile): Check {
  const should = 'Лише латинські символи';
  if (!profile.name) return check('name', null, should, 'error', 'Ім’я в профілі відсутнє');
  const kind = latinKind(profile.name.replace(',', ' '));
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

/** The CURRENT affiliation — Scopus keeps the history apart — names the university. */
export function checkScopusAffiliation(profile: ScopusProfile): Check {
  const should = `Афіліація: «${UNIVERSITY_NAME}» або «${UNIVERSITY_NAME_UK}»`;
  if (profile.affiliations.length === 0) {
    return check('affiliations', null, should, 'error', 'Поточну афіліацію не вказано');
  }
  const shown = profile.affiliations.join('; ');
  if (profile.affiliations.some(isUniversityName)) {
    return check('affiliations', shown, should, 'ok');
  }
  return check('affiliations', shown, should, 'error', `Афіліація не є університетом: «${shown}»`);
}

/** A number, no threshold: the university has not given one. */
export function checkScopusHIndex(profile: ScopusProfile): Check {
  if (profile.hIndex === null) {
    return check('h_index', null, 'Показники профілю', 'warning', 'H-індекс не повернуто');
  }
  return check('h_index', { all: profile.hIndex }, 'Інформація', 'ok');
}

/** Scopus calls them «subject areas»; they are what the person's documents are filed under. */
export function checkScopusAreas(profile: ScopusProfile): Check {
  const should = 'У профілі вказано предметні області (Subject areas)';
  if (profile.subjectAreas.length > 0) {
    return check('subject_categories', profile.subjectAreas, should, 'ok');
  }
  return check(
    'subject_categories',
    null,
    should,
    'error',
    'У профілі не вказано предметні області'
  );
}
