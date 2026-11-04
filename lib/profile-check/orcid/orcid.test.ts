import { describe, expect, it } from 'vitest';
import {
  checkAffiliations,
  checkEmail,
  checkLinks,
  checkName,
  checkWorks,
  runOrcidChecks,
} from './checks';
import { extractOrcid } from './extract';

/** A record shaped like pub.orcid.org's, trimmed to what the extractor reads */
const RECORD = {
  person: {
    name: { 'given-names': { value: 'Olena' }, 'family-name': { value: 'Kulyk' } },
    emails: {
      email: [
        { email: 'kulyk@uhsp.edu.ua', verified: true, primary: true },
        { email: 'olena@gmail.com', verified: false, primary: false },
      ],
    },
    addresses: { address: [{ country: { value: 'UA' } }] },
    keywords: { keyword: [{ content: 'linguistics' }] },
    'researcher-urls': {
      'researcher-url': [
        {
          'url-name': { value: 'University' },
          url: { value: 'https://uhsp.edu.ua/personnel/kulyk' },
        },
      ],
    },
    'external-ids': {
      'external-identifier': [
        {
          'external-id-type': 'Scopus Author ID',
          'external-id-value': '123',
          'external-id-url': { value: 'https://www.scopus.com/authid/detail.uri?authorId=123' },
        },
      ],
    },
  },
  'activities-summary': {
    employments: {
      'affiliation-group': [
        {
          summaries: [
            {
              'employment-summary': {
                'department-name': 'Chair',
                'role-title': 'Professor',
                'start-date': { year: { value: '2015' }, month: { value: '09' } },
                'end-date': null,
                organization: { name: 'Hryhorii Skovoroda University in Pereiaslav' },
                'display-index': '1',
              },
            },
          ],
        },
      ],
    },
    works: {
      group: [
        {
          'work-summary': [
            {
              title: { title: { value: 'A paper' } },
              'publication-date': { year: { value: '2026' } },
              'display-index': '0',
              'external-ids': {
                'external-id': [{ 'external-id-type': 'doi', 'external-id-value': '10.1/x' }],
              },
            },
          ],
        },
      ],
    },
  },
};

const NOW = new Date('2026-11-04T10:00:00Z');
const NO_OTHER_LINKS = { wos: false, scopus: false, googleScholar: false };

describe('extractOrcid', () => {
  const data = extractOrcid(RECORD);

  it('reads the name, country and keywords', () => {
    expect(data.name).toEqual({ given: 'Olena', family: 'Kulyk', credit: '' });
    expect(data.country).toBe('UA');
    expect(data.keywords).toEqual(['linguistics']);
  });

  it('reads researcher urls and external ids as links', () => {
    expect(data.linksAndIds.map((l) => l.url)).toEqual([
      'https://uhsp.edu.ua/personnel/kulyk',
      'https://www.scopus.com/authid/detail.uri?authorId=123',
    ]);
  });

  it('keeps the affiliation current when it has no end date, and never invents a star', () => {
    expect(data.affiliations[0]).toMatchObject({
      current: true,
      startDate: '2015-09',
      preferred: null,
    });
  });

  it('finds the latest work and its DOI', () => {
    expect(data.mostRecentWork).toMatchObject({ title: 'A paper', year: '2026', doi: '10.1/x' });
  });

  it('survives an empty record', () => {
    const empty = extractOrcid({});
    expect(empty.affiliations).toEqual([]);
    expect(empty.mostRecentWork).toBeNull();
  });
});

describe('checks', () => {
  const data = extractOrcid(RECORD);

  it('passes a complete record with no error', () => {
    const checks = runOrcidChecks(data, NO_OTHER_LINKS, NOW);
    expect(checks.filter((c) => c.status === 'error')).toEqual([]);
  });

  it('flags a Cyrillic lookalike in a Latin name as a warning, a real Cyrillic name as an error', () => {
    const lookalike = { ...data, name: { given: 'Оlena', family: 'Kulyk', credit: '' } };
    expect(checkName(lookalike).status).toBe('warning');
    const cyrillic = { ...data, name: { given: 'Олена', family: 'Кулик', credit: '' } };
    expect(checkName(cyrillic).status).toBe('error');
  });

  it('needs a verified corporate email and a personal one', () => {
    expect(checkEmail(data).status).toBe('ok');
    const unverified = {
      ...data,
      emails: [{ email: 'a@uhsp.edu.ua', verified: false, primary: true }, data.emails[1]],
    };
    expect(checkEmail(unverified).message).toMatch(/не підтверджений/);
    const onlyCorporate = { ...data, emails: [data.emails[0]] };
    expect(checkEmail(onlyCorporate).message).toMatch(/Немає особистого/);
  });

  it('does not take a lookalike domain for the corporate one', () => {
    const fake = {
      ...data,
      emails: [{ email: 'a@uhsp.edu.ua.evil.com', verified: true, primary: true }],
    };
    expect(checkEmail(fake).message).toMatch(/Немає корпоративного/);
  });

  it('requires the other profiles only when the person gave them', () => {
    expect(checkLinks(data, NO_OTHER_LINKS).status).toBe('ok');
    expect(checkLinks(data, { ...NO_OTHER_LINKS, scopus: true }).status).toBe('ok');
    expect(checkLinks(data, { ...NO_OTHER_LINKS, wos: true }).message).toMatch(/WoS/);
    expect(checkLinks(data, { ...NO_OTHER_LINKS, googleScholar: true }).status).toBe('info');
  });

  it('errors when the university page is not linked', () => {
    const bare = { ...data, linksAndIds: [] };
    expect(checkLinks(bare, NO_OTHER_LINKS).message).toMatch(/профіль університету/);
  });

  it('says the star could not be checked instead of claiming it was', () => {
    const c = checkAffiliations(data);
    expect(c.status).toBe('info');
    expect(c.message).toMatch(/Зірку/);
  });

  it('errors on an ended employment at the university', () => {
    const left = { ...data, affiliations: [{ ...data.affiliations[0], current: false }] };
    expect(checkAffiliations(left).status).toBe('error');
  });

  it('judges the latest work against the clock it is given', () => {
    expect(checkWorks(data, NOW).status).toBe('ok');
    expect(checkWorks(data, new Date('2029-01-01')).status).toBe('error');
    expect(checkWorks({ ...data, mostRecentWork: null }, NOW).status).toBe('error');
  });
});
