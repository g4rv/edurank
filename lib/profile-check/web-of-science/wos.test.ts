import { describe, expect, it, vi } from 'vitest';
import { createGate } from '@/lib/profile-check/gate';
import { createScopusChecker, scopusAuthorId } from '@/lib/profile-check/scopus';
import { tally } from '@/lib/profile-check/tally';
import {
  checkWosAffiliation,
  checkWosCategories,
  checkWosHIndex,
  checkWosName,
  checkWosOrcid,
} from './checks';
import { createWosChecker, whyNoProfile, type WosOpen } from './index';
import { isResearcherId, parseWosProfile, wosRecordId } from './parse';

/** What a browser shows for the reference profile — one block per line */
const TEXT = [
  'WOS Top Header',
  'Author Profile',
  'Iryna Kamenska',
  'Hryhorii Skovoroda University in PereiaslavUkraine',
  'Identifiers',
  'Web of Science ResearcherIDHGB-1335-2022',
  'https://orcid.org/0000-0003-2872-5065',
  'Published names',
  'Kamenska, Iryna',
  'Kamenska, I',
  'Organization',
  'Hryhorii Skovoroda University in Pereiaslav',
  'Subject Categories',
  'Business & Economics Education & Educational Research',
  'Metrics',
  'Profile summary',
  '109',
  'Total documents',
  'Web of Science Core Collection metrics',
  '2',
  'H-Index',
  '3',
  'Publications',
].join('\n');

const profile = (over: Partial<NonNullable<ReturnType<typeof parseWosProfile>>> = {}) => ({
  ...parseWosProfile({ name: 'Iryna Kamenska', text: TEXT })!,
  ...over,
});

const LINK = 'https://www.webofscience.com/wos/author/record/HGB-1335-2022';
const OWN = '0000-0003-2872-5065';
const person = {
  staffId: 's',
  name: 'x',
  faculty: null,
  department: null,
  links: { orcid: OWN },
};
const open = () => createGate({ gapMs: 0, jitterMs: 0, sleep: async () => {} });

describe('parseWosProfile', () => {
  it('reads the reference profile', () => {
    expect(parseWosProfile({ name: 'Iryna Kamenska', text: TEXT })).toEqual({
      name: 'Iryna Kamenska',
      affiliation: 'Hryhorii Skovoroda University in PereiaslavUkraine',
      researcherId: 'HGB-1335-2022',
      orcid: '0000-0003-2872-5065',
      publishedNames: ['Kamenska, Iryna', 'Kamenska, I'],
      organization: 'Hryhorii Skovoroda University in Pereiaslav',
      hIndex: 2,
      subjectCategories: [],
      hasCategoriesSection: true,
    });
  });

  it('leaves what is missing null instead of guessing', () => {
    const p = parseWosProfile({ name: 'Iryna Kamenska', text: 'Iryna Kamenska\nIdentifiers' });
    expect(p).toMatchObject({ orcid: null, researcherId: null, organization: null, hIndex: null });
  });

  it('takes the h-index from the line before its label, not another number', () => {
    const p = parseWosProfile({ name: 'N', text: 'N\n109\nTotal documents\n7\nH-Index' });
    expect(p?.hIndex).toBe(7);
  });

  it('has no profile without a name', () => {
    expect(parseWosProfile({ name: '  ', text: TEXT })).toBeNull();
  });
});

describe('record ids', () => {
  it('finds the id in a profile link, ResearcherID or numeric', () => {
    expect(wosRecordId(LINK)).toBe('HGB-1335-2022');
    expect(wosRecordId('https://www.webofscience.com/wos/author/record/30747601')).toBe('30747601');
    expect(wosRecordId('https://www.researcherid.com/rid/A-1234-2008')).toBe('A-1234-2008');
    expect(wosRecordId('https://www.webofscience.com/')).toBeNull();
  });
  it('tells a ResearcherID from a numeric record', () => {
    expect(isResearcherId('HGB-1335-2022')).toBe(true);
    expect(isResearcherId('30747601')).toBe(false);
  });
});

describe('Web of Science rules', () => {
  it('ORCID: the profile’s own, missing, or somebody else’s', () => {
    expect(checkWosOrcid(profile(), OWN).status).toBe('ok');
    expect(checkWosOrcid(profile({ orcid: null }), OWN).status).toBe('error');
    const other = checkWosOrcid(profile(), '0000-0001-1111-1111');
    expect(other.status).toBe('error');
    expect(other.message).toContain(OWN);
    expect(other.message).toContain('0000-0001-1111-1111');
    // nothing to compare to: present is enough
    expect(checkWosOrcid(profile(), null).status).toBe('ok');
  });

  it('name: Latin only', () => {
    expect(checkWosName(profile()).status).toBe('ok');
    expect(checkWosName(profile({ name: 'Ірина Каменська' })).status).toBe('error');
    expect(checkWosName(profile({ name: 'Iryna Kаmenska' })).message).toMatch(/схожі/);
  });

  it('affiliation: the university in English or Ukrainian, not another one or a misspelling', () => {
    expect(checkWosAffiliation(profile()).status).toBe('ok');
    const uk = 'Університет Григорія Сковороди в Переяславі';
    expect(checkWosAffiliation(profile({ organization: uk, affiliation: null })).status).toBe('ok');
    const other = checkWosAffiliation(
      profile({ organization: 'National Academy of Statistics', affiliation: null })
    );
    expect(other.status).toBe('error');
    const typo = 'Hryhorii Skovoroda University in Pereyaslav';
    expect(checkWosAffiliation(profile({ organization: typo, affiliation: null })).status).toBe(
      'error'
    );
    expect(checkWosAffiliation(profile({ organization: null, affiliation: null })).status).toBe(
      'error'
    );
  });

  it('h-index: recorded as a number; a missing one is a warning', () => {
    expect(checkWosHIndex(profile()).current).toEqual({ all: 2 });
    expect(checkWosHIndex(profile({ hIndex: null })).status).toBe('warning');
  });
});

describe('the Web of Science checker', () => {
  const CATEGORIES = ['Business & Economics', 'Education & Educational Research'];
  const okPage: WosOpen = {
    kind: 'ok',
    name: 'Iryna Kamenska',
    text: TEXT,
    categories: CATEGORIES,
  };

  it('passes the reference profile', async () => {
    const checker = createWosChecker(open(), async () => okPage);
    const r = await checker.check(LINK, { person, fetchImpl: fetch });
    expect(r.status).toBe('ok');
    expect(r.link).toBe(LINK);
    expect(r.checks.map((c) => c.field)).toEqual([
      'orcid',
      'name',
      'affiliations',
      'h_index',
      'subject_categories',
    ]);
    expect(r.checks.at(-1)?.current).toEqual(CATEGORIES);
  });

  it('fails the platform when a rule fails', async () => {
    const text = TEXT.replace('0000-0003-2872-5065', '0000-0001-1111-1111');
    const checker = createWosChecker(open(), async () => ({
      kind: 'ok',
      name: 'Iryna Kamenska',
      text,
      categories: [],
    }));
    expect((await checker.check(LINK, { person, fetchImpl: fetch })).status).toBe('error');
  });

  it('errors on a link with no record id, without opening a browser', async () => {
    const opener = vi.fn(async () => okPage);
    const checker = createWosChecker(open(), opener);
    const r = await checker.check('https://www.webofscience.com/', { person, fetchImpl: fetch });
    expect(r.status).toBe('error');
    expect(opener).not.toHaveBeenCalled();
  });

  it('errors on a record that does not exist', async () => {
    const checker = createWosChecker(open(), async () => ({ kind: 'not_found' }));
    expect((await checker.check(LINK, { person, fetchImpl: fetch })).status).toBe('error');
  });

  it('says so when there is no browser, and does not call it an error of the profile', async () => {
    const checker = createWosChecker(open(), async () => ({ kind: 'unavailable' }));
    const r = await checker.check(LINK, { person, fetchImpl: fetch });
    expect(r.status).toBe('failed');
    expect(r.error).toMatch(/Браузер/);
  });

  it('after a challenge, fails the rest fast without asking again', async () => {
    let t = 0;
    const gate = createGate({
      gapMs: 0,
      jitterMs: 0,
      cooldownMs: 600_000,
      now: () => t,
      sleep: async () => {},
    });
    const opener = vi.fn(async (): Promise<WosOpen> => ({ kind: 'blocked' }));
    const checker = createWosChecker(gate, opener);
    expect((await checker.check(LINK, { person, fetchImpl: fetch })).status).toBe('failed');
    expect((await checker.check(LINK, { person, fetchImpl: fetch })).error).toMatch(/спробуйте/);
    expect(opener).toHaveBeenCalledTimes(1);
    t = 600_001;
    await checker.check(LINK, { person, fetchImpl: fetch });
    expect(opener).toHaveBeenCalledTimes(2);
  });
});

describe('Scopus, without a key', () => {
  // Pinned to «no key», so a key in the environment can never send this test online
  const noKeyScopus = createScopusChecker({ getKey: () => null });

  const link = 'https://www.scopus.com/authid/detail.uri?authorId=57219915893';

  it('reads the author id from a link, any case', () => {
    expect(scopusAuthorId(link)).toBe('57219915893');
    expect(
      scopusAuthorId('http://www.scopus.com/inward/authorDetails.url?authorID=58209804700&x=1')
    ).toBe('58209804700');
    expect(scopusAuthorId('https://www.scopus.com/')).toBeNull();
  });

  it('passes a link with an id and says plainly that the profile is not read', async () => {
    const r = await noKeyScopus.check(link, { person, fetchImpl: fetch });
    expect(r.status).toBe('ok');
    const note = r.checks.find((c) => c.field === 'scopus_content');
    expect(note?.status).toBe('info');
    expect(note?.message).toMatch(/ключ/);
  });

  it('errors on a link with no author id', async () => {
    const r = await noKeyScopus.check('https://www.scopus.com/', { person, fetchImpl: fetch });
    expect(r.status).toBe('error');
  });
});

describe('subject categories', () => {
  const categories = [' Business & Economics ', 'Education & Educational Research', '  '];

  it('are read from the chips, trimmed, and an empty chip is dropped', () => {
    const p = parseWosProfile({ name: 'Iryna Kamenska', text: TEXT, categories });
    expect(p?.subjectCategories).toEqual([
      'Business & Economics',
      'Education & Educational Research',
    ]);
  });

  it('are empty, not guessed from the run-together line, when no chips were read', () => {
    expect(parseWosProfile({ name: 'Iryna Kamenska', text: TEXT })?.subjectCategories).toEqual([]);
  });

  it('are a requirement: present is a success, counted like the others', () => {
    const c = checkWosCategories(profile({ subjectCategories: ['A', 'B'] }));
    expect(c).toMatchObject({ field: 'subject_categories', status: 'ok', current: ['A', 'B'] });
    const tallied = tally([checkWosOrcid(profile(), OWN), c]);
    expect(tallied.map((t) => t.text)).toEqual(['2 успішно']);
  });

  it('are an error when the profile has none — there is no heading on the page', () => {
    const none = parseWosProfile({
      name: 'Iryna Kamenska',
      text: TEXT.replace('Subject Categories', 'Something else'),
      categories: [],
    })!;
    const c = checkWosCategories(none);
    expect(c.status).toBe('error');
    expect(c.message).toMatch(/не вказано предметні категорії/);
  });

  it('are only a warning when the heading is there but none could be read — that is our doubt', () => {
    const c = checkWosCategories(profile({ subjectCategories: [], hasCategoriesSection: true }));
    expect(c.status).toBe('warning');
  });

  it('are part of the platform result, so a profile without them fails the platform', async () => {
    const text = TEXT.replace('Subject Categories', 'Something else');
    const checker = createWosChecker(open(), async () => ({
      kind: 'ok',
      name: 'Iryna Kamenska',
      text,
      categories: [],
    }));
    const r = await checker.check(LINK, { person, fetchImpl: fetch });
    expect(r.checks.find((c) => c.field === 'subject_categories')?.status).toBe('error');
    expect(r.status).toBe('error');
  });
});

describe('whyNoProfile', () => {
  it('is a block when the site refused one of its own data calls', () => {
    expect(whyNoProfile(true, 'Web of Science')).toBe('blocked');
  });
  it('is a block on a challenge page, in any case', () => {
    expect(whyNoProfile(false, 'Just a moment...')).toBe('blocked');
    expect(whyNoProfile(false, 'Verify you are human')).toBe('blocked');
  });
  it('is only an error for an ordinary page that did not fill in', () => {
    expect(whyNoProfile(false, 'Web of Science WOS Top Header')).toBe('error');
  });
});
