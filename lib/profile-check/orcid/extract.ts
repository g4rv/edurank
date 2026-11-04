/**
 * ORCID public API record → the flat shape the checks read.
 *
 * Ported from `scrapers/orcid.py` `extract()`. Pure: no network, so it is
 * tested on fixtures.
 *
 * **What the API cannot tell us:** which employment carries the ★ («preferred»
 * — the one ORCID shows first on the page). The Python tool read it from the
 * rendered page with Selenium. `display-index` is NOT a substitute — against
 * 8 real records the star sat on the lowest index in 5 and not in 3. So
 * `preferred` is `null` here (unknown) and the affiliation check says so
 * instead of guessing.
 */

type Json = Record<string, unknown>;

function isObject(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** A walk down nested objects; anything that is not an object stops it. */
export function dig(d: unknown, ...keys: string[]): unknown {
  let cur: unknown = d;
  for (const k of keys) {
    if (!isObject(cur)) return undefined;
    cur = cur[k];
    if (cur === undefined || cur === null) return undefined;
  }
  return cur;
}

function str(d: unknown, ...keys: string[]): string {
  const v = dig(d, ...keys);
  return typeof v === 'string' ? v : '';
}

function list(v: unknown): Json[] {
  if (v === undefined || v === null) return [];
  return (Array.isArray(v) ? v : [v]).filter(isObject);
}

function parseDate(d: unknown): string | null {
  const year = str(d, 'year', 'value');
  const month = str(d, 'month', 'value');
  if (!year) return null;
  return month ? `${year}-${month}` : year;
}

/** The summaries inside every `<section>.affiliation-group[].summaries[]` */
function affiliationGroups(activities: unknown, section: string, summaryKey: string): Json[] {
  const out: Json[] = [];
  for (const group of list(dig(activities, section, 'affiliation-group'))) {
    for (const s of list(group.summaries)) {
      const aff = s[summaryKey];
      if (isObject(aff)) out.push(aff);
    }
  }
  return out;
}

export interface OrcidEmail {
  email: string | null;
  verified: boolean;
  primary: boolean;
}

export interface OrcidLink {
  type: string;
  name: string;
  value: string;
  url: string;
}

export interface OrcidAffiliation {
  name: string;
  orgCity: string;
  orgRegion: string;
  orgCountry: string;
  url: string;
  department: string;
  role: string;
  startDate: string | null;
  endDate: string | null;
  current: boolean;
  /** null = the API does not say; see the file header */
  preferred: boolean | null;
  displayIndex: number;
}

export interface OrcidWork {
  title: string;
  year: string | null;
  type: string | null;
  journal: string | null;
  doi: string | null;
  url: string | null;
}

export interface OrcidProfessionalActivity {
  type: string;
  name: string;
  department: string;
  role: string;
  startDate: string | null;
  endDate: string | null;
}

export interface OrcidData {
  name: { given: string; family: string; credit: string };
  pseudonyms: string[];
  caption: string | null;
  emails: OrcidEmail[];
  linksAndIds: OrcidLink[];
  keywords: string[];
  country: string | null;
  affiliations: OrcidAffiliation[];
  education: { name: string; department: string; degree: string }[];
  professionalActivities: OrcidProfessionalActivity[];
  mostRecentWork: OrcidWork | null;
}

const PROFESSIONAL_SECTIONS: [string, string][] = [
  ['memberships', 'membership-summary'],
  ['distinctions', 'distinction-summary'],
  ['invited-positions', 'invited-position-summary'],
  ['services', 'service-summary'],
  ['qualifications', 'qualification-summary'],
];

function text(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

export function extractOrcid(record: unknown): OrcidData {
  const person = dig(record, 'person');
  const activities = dig(record, 'activities-summary');

  const emails: OrcidEmail[] = list(dig(person, 'emails', 'email')).map((e) => ({
    email: typeof e.email === 'string' ? e.email : null,
    verified: e.verified === true,
    primary: e.primary === true,
  }));

  const linksAndIds: OrcidLink[] = [];
  for (const w of list(dig(person, 'researcher-urls', 'researcher-url'))) {
    const url = str(w, 'url', 'value');
    if (url) linksAndIds.push({ type: 'url', name: str(w, 'url-name', 'value'), value: url, url });
  }
  const extIds = dig(person, 'external-ids');
  const identifiers = list(dig(extIds, 'external-identifier'));
  for (const e of identifiers.length ? identifiers : list(dig(extIds, 'external-id'))) {
    const type = text(e['external-id-type']);
    const value = text(e['external-id-value']);
    if (value) {
      linksAndIds.push({ type, name: type, value, url: str(e, 'external-id-url', 'value') });
    }
  }

  const addresses = list(dig(person, 'addresses', 'address'));
  const country = addresses.length ? str(addresses[0], 'country', 'value') || null : null;

  const affiliations: OrcidAffiliation[] = affiliationGroups(
    activities,
    'employments',
    'employment-summary'
  ).map((aff) => {
    const addr = dig(aff, 'organization', 'address');
    return {
      name: str(aff, 'organization', 'name') || 'N/A',
      orgCity: str(addr, 'city'),
      orgRegion: str(addr, 'region'),
      orgCountry: str(addr, 'country'),
      url: str(aff, 'url', 'value'),
      department: text(aff['department-name']),
      role: text(aff['role-title']),
      startDate: parseDate(aff['start-date']),
      endDate: parseDate(aff['end-date']),
      current: !isObject(aff['end-date']),
      preferred: null,
      displayIndex: Number(aff['display-index'] ?? 0) || 0,
    };
  });

  const education = affiliationGroups(activities, 'educations', 'education-summary').map((edu) => ({
    name: str(edu, 'organization', 'name') || 'N/A',
    department: text(edu['department-name']),
    degree: text(edu['role-title']),
  }));

  const professionalActivities: OrcidProfessionalActivity[] = [];
  for (const [section, key] of PROFESSIONAL_SECTIONS) {
    for (const act of affiliationGroups(activities, section, key)) {
      professionalActivities.push({
        type: section,
        name: str(act, 'organization', 'name') || 'N/A',
        department: text(act['department-name']),
        role: text(act['role-title']),
        startDate: parseDate(act['start-date']),
        endDate: parseDate(act['end-date']),
      });
    }
  }

  return {
    name: {
      given: str(person, 'name', 'given-names', 'value'),
      family: str(person, 'name', 'family-name', 'value'),
      credit: str(person, 'name', 'credit-name', 'value'),
    },
    pseudonyms: list(dig(person, 'other-names', 'other-name'))
      .map((n) => text(n.content))
      .filter(Boolean),
    caption: str(person, 'biography', 'content') || null,
    emails,
    linksAndIds,
    keywords: list(dig(person, 'keywords', 'keyword'))
      .map((k) => text(k.content))
      .filter(Boolean),
    country,
    affiliations,
    education,
    professionalActivities,
    mostRecentWork: mostRecentWork(activities),
  };
}

function mostRecentWork(activities: unknown): OrcidWork | null {
  const groups = list(dig(activities, 'works', 'group'));
  if (!groups.length) return null;
  // Works come newest-first; the first group's best summary is the latest
  let best: Json | null = null;
  for (const s of list(groups[0]['work-summary'])) {
    if (!best || (Number(s['display-index']) || 0) > (Number(best['display-index']) || 0)) {
      best = s;
    }
  }
  if (!best) return null;
  const doiEntry = list(dig(best, 'external-ids', 'external-id')).find(
    (e) => e['external-id-type'] === 'doi'
  );
  return {
    title: str(best, 'title', 'title', 'value'),
    year: str(best, 'publication-date', 'year', 'value') || null,
    type: typeof best.type === 'string' ? best.type : null,
    journal: str(best, 'journal-title', 'value') || null,
    doi: doiEntry ? text(doiEntry['external-id-value']) || null : null,
    url: str(best, 'url', 'value') || null,
  };
}
