/**
 * What the university requires of a profile — the only place these live.
 * Ported from `normalizer.py`; change a requirement here, not in a check.
 */
export const UNIVERSITY_NAME = 'Hryhorii Skovoroda University in Pereiaslav';
/** The name as ORCID's own organisation list prints it in Ukrainian */
export const UNIVERSITY_NAME_UK = 'Університет Григорія Сковороди в Переяславі';

/** One spelling: no case, no quotes, one space between words */
function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/["'«»“”]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const UNIVERSITY_NAMES = [UNIVERSITY_NAME, UNIVERSITY_NAME_UK].map(normaliseName);

/**
 * Whether an employer's name is the university — in English or in Ukrainian
 * (owner, 2026-11-04: 17 people list the Ukrainian one, and it is the same
 * organisation). A suffix such as «: Pereiaslav, UA» is fine; a misspelling
 * («Pereyaslav») is not, because that is what the check exists to catch.
 */
export function isUniversityName(name: string): boolean {
  const n = normaliseName(name);
  return UNIVERSITY_NAMES.some((u) => n.includes(u));
}
export const CORPORATE_DOMAIN = 'uhsp.edu.ua';
export const COUNTRY_CODE = 'UA';
/** The personal page on the university site that ORCID must link to */
export const UNIVERSITY_PROFILE_HOST_PATH = 'uhsp.edu.ua/personnel/';
