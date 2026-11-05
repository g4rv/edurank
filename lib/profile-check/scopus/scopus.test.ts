import { describe, expect, it, vi } from 'vitest';
import { createGate } from '@/lib/profile-check/gate';
import { tally } from '@/lib/profile-check/tally';
import { fetchScopusAuthor, type ScopusFetch } from './api';
import {
  checkScopusAffiliation,
  checkScopusAreas,
  checkScopusHIndex,
  checkScopusName,
  checkScopusOrcid,
} from './checks';
import { createScopusChecker } from './index';
import { parseScopusAuthor } from './parse';

/** The shape of the reference author's `view=ENHANCED` answer, trimmed to what is read */
const ITEM = {
  '@status': 'found',
  coredata: {
    'dc:identifier': 'AUTHOR_ID:57219915893',
    orcid: '0000-0003-2872-5065',
    'document-count': '7',
    'cited-by-count': '10',
    'citation-count': '11',
  },
  'h-index': '2',
  'subject-areas': {
    'subject-area': [
      { '@abbrev': 'ENGI', '@code': '2214', $: 'Media Technology' },
      { '@abbrev': 'SOCI', '@code': '3304', $: 'Education' },
      { '@abbrev': 'ENGI', '@code': '2214', $: 'Media Technology' },
    ],
  },
  'author-profile': {
    'preferred-name': { surname: 'Kamenska', 'given-name': 'I.', 'indexed-name': 'Kamenska I.' },
    'affiliation-current': {
      affiliation: {
        'ip-doc': { afdispname: 'Hryhorii Skovoroda University in Pereiaslav' },
      },
    },
  },
};

const MINIMIZED = {
  coredata: { 'dc:identifier': 'AUTHOR_ID:57219915893', eid: '9-s2.0-57219915893' },
};

const profile = (over: Record<string, unknown> = {}) => ({
  ...parseScopusAuthor(ITEM)!,
  ...over,
});

const LINK = 'https://www.scopus.com/authid/detail.uri?authorId=57219915893';
const OWN = '0000-0003-2872-5065';
const person = {
  staffId: 's',
  name: 'x',
  faculty: null,
  department: null,
  links: { orcid: OWN },
};
const open = () => createGate({ gapMs: 0, jitterMs: 0, sleep: async () => {} });
const withKey = (fetchAuthor: (...a: never[]) => Promise<ScopusFetch>, gate = open()) =>
  createScopusChecker({ gate, getKey: () => 'KEY', fetchAuthor: fetchAuthor as never });

describe('parseScopusAuthor', () => {
  it('reads the reference author', () => {
    expect(parseScopusAuthor(ITEM)).toEqual({
      authorId: '57219915893',
      orcid: '0000-0003-2872-5065',
      name: 'Kamenska, I.',
      affiliations: ['Hryhorii Skovoroda University in Pereiaslav'],
      hIndex: 2,
      documents: 7,
      citations: 11,
      subjectAreas: ['Media Technology', 'Education'], // each once
      minimized: false,
    });
  });

  it('knows a minimized answer — only the id — from an empty profile', () => {
    expect(parseScopusAuthor(MINIMIZED)?.minimized).toBe(true);
    expect(parseScopusAuthor(ITEM)?.minimized).toBe(false);
  });

  it('reads several current affiliations', () => {
    const item = {
      ...ITEM,
      'author-profile': {
        ...ITEM['author-profile'],
        'affiliation-current': {
          affiliation: [{ 'ip-doc': { afdispname: 'A' } }, { 'ip-doc': { afdispname: 'B' } }],
        },
      },
    };
    expect(parseScopusAuthor(item)?.affiliations).toEqual(['A', 'B']);
  });

  it('refuses a malformed ORCID rather than reporting it', () => {
    const item = { ...ITEM, coredata: { ...ITEM.coredata, orcid: 'not-an-orcid' } };
    expect(parseScopusAuthor(item)?.orcid).toBeNull();
  });

  it('is nothing for a missing author or no id', () => {
    expect(parseScopusAuthor(null)).toBeNull();
    expect(parseScopusAuthor({ '@status': 'not-found' })).toBeNull();
    expect(parseScopusAuthor({ coredata: {} })).toBeNull();
  });
});

describe('Scopus rules', () => {
  it('ORCID: the profile’s own, missing, or somebody else’s', () => {
    expect(checkScopusOrcid(profile(), OWN).status).toBe('ok');
    expect(checkScopusOrcid(profile({ orcid: null }), OWN).status).toBe('error');
    const other = checkScopusOrcid(profile(), '0000-0001-1111-1111');
    expect(other.status).toBe('error');
    expect(other.message).toContain(OWN);
    expect(checkScopusOrcid(profile(), null).status).toBe('ok');
  });

  it('name: Latin only', () => {
    expect(checkScopusName(profile()).status).toBe('ok');
    expect(checkScopusName(profile({ name: 'Каменська, І.' })).status).toBe('error');
    expect(checkScopusName(profile({ name: null })).status).toBe('error');
  });

  it('affiliation: the university, in English or Ukrainian — not another, not a misspelling', () => {
    expect(checkScopusAffiliation(profile()).status).toBe('ok');
    const uk = ['Університет Григорія Сковороди в Переяславі'];
    expect(checkScopusAffiliation(profile({ affiliations: uk })).status).toBe('ok');
    expect(checkScopusAffiliation(profile({ affiliations: ['Other University'] })).status).toBe(
      'error'
    );
    expect(
      checkScopusAffiliation(
        profile({ affiliations: ['Hryhorii Skovoroda University in Pereyaslav'] })
      ).status
    ).toBe('error');
    expect(checkScopusAffiliation(profile({ affiliations: [] })).status).toBe('error');
  });

  it('affiliation: any one of several current ones may be the university', () => {
    const two = ['Some Institute', 'Hryhorii Skovoroda University in Pereiaslav'];
    expect(checkScopusAffiliation(profile({ affiliations: two })).status).toBe('ok');
  });

  it('h-index: a number; a missing one is a warning', () => {
    expect(checkScopusHIndex(profile()).current).toEqual({ all: 2 });
    expect(checkScopusHIndex(profile({ hIndex: null })).status).toBe('warning');
  });

  it('subject areas: required, and counted as a success when present', () => {
    const c = checkScopusAreas(profile());
    expect(c).toMatchObject({ field: 'subject_categories', status: 'ok' });
    expect(checkScopusAreas(profile({ subjectAreas: [] })).status).toBe('error');
    expect(tally([checkScopusOrcid(profile(), OWN), c]).map((t) => t.text)).toEqual(['2 успішно']);
  });
});

describe('the Scopus checker, with a key', () => {
  it('passes the reference author and reads the five rules', async () => {
    const checker = withKey(async () => ({ kind: 'ok', item: ITEM }));
    const r = await checker.check(LINK, { person, fetchImpl: fetch });
    expect(r.status).toBe('ok');
    expect(r.checks.map((c) => c.field)).toEqual([
      'orcid',
      'name',
      'affiliations',
      'h_index',
      'subject_categories',
    ]);
  });

  it('fails the platform when a rule fails', async () => {
    const item = { ...ITEM, coredata: { ...ITEM.coredata, orcid: '0000-0001-1111-1111' } };
    const checker = withKey(async () => ({ kind: 'ok', item }));
    expect((await checker.check(LINK, { person, fetchImpl: fetch })).status).toBe('error');
  });

  it('says the key gives no profile when only the id came back — never an empty profile', async () => {
    const checker = withKey(async () => ({ kind: 'ok', item: MINIMIZED }));
    const r = await checker.check(LINK, { person, fetchImpl: fetch });
    expect(r.status).toBe('failed');
    expect(r.error).toMatch(/не дає доступу/);
  });

  it('reports an unknown author, a refused key and a network error each as itself', async () => {
    const run = (kind: ScopusFetch) =>
      withKey(async () => kind).check(LINK, { person, fetchImpl: fetch });
    expect((await run({ kind: 'not_found' })).status).toBe('error');
    expect((await run({ kind: 'unauthorized' })).status).toBe('failed');
    expect((await run({ kind: 'error', message: 'offline' })).error).toBe('offline');
  });

  it('after the quota is used up, fails the rest fast without asking again', async () => {
    let t = 0;
    const gate = createGate({
      gapMs: 0,
      jitterMs: 0,
      cooldownMs: 600_000,
      now: () => t,
      sleep: async () => {},
    });
    const fetchAuthor = vi.fn(async (): Promise<ScopusFetch> => ({ kind: 'limited' }));
    const checker = withKey(fetchAuthor, gate);
    expect((await checker.check(LINK, { person, fetchImpl: fetch })).status).toBe('failed');
    expect((await checker.check(LINK, { person, fetchImpl: fetch })).error).toMatch(/спробуйте/);
    expect(fetchAuthor).toHaveBeenCalledTimes(1);
    t = 600_001;
    await checker.check(LINK, { person, fetchImpl: fetch });
    expect(fetchAuthor).toHaveBeenCalledTimes(2);
  });

  it('errors on a link with no author id, without asking Elsevier', async () => {
    const fetchAuthor = vi.fn(async (): Promise<ScopusFetch> => ({ kind: 'ok', item: ITEM }));
    const r = await withKey(fetchAuthor).check('https://www.scopus.com/', {
      person,
      fetchImpl: fetch,
    });
    expect(r.status).toBe('error');
    expect(fetchAuthor).not.toHaveBeenCalled();
  });

  it('without a key falls back to the link alone and says so', async () => {
    const checker = createScopusChecker({ getKey: () => null });
    const r = await checker.check(LINK, { person, fetchImpl: fetch });
    expect(r.status).toBe('ok');
    expect(r.checks.find((c) => c.field === 'scopus_content')?.message).toMatch(/SCOPUS_API_KEY/);
  });
});

describe('fetchScopusAuthor', () => {
  const respond = (status: number, body: unknown = {}): typeof fetch =>
    (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;

  it('sends the key in the header and reads the first author of the answer', async () => {
    const seen: string[] = [];
    const f = (async (_url: string, init: RequestInit) => {
      seen.push((init.headers as Record<string, string>)['X-ELS-APIKey']);
      return new Response(JSON.stringify({ 'author-retrieval-response': [ITEM] }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await fetchScopusAuthor('57219915893', 'KEY', f);
    expect(r).toEqual({ kind: 'ok', item: ITEM });
    expect(seen).toEqual(['KEY']);
  });

  it('maps each status to its own outcome', async () => {
    expect((await fetchScopusAuthor('1', 'K', respond(401))).kind).toBe('unauthorized');
    expect((await fetchScopusAuthor('1', 'K', respond(403))).kind).toBe('unauthorized');
    expect((await fetchScopusAuthor('1', 'K', respond(404))).kind).toBe('not_found');
    expect((await fetchScopusAuthor('1', 'K', respond(429))).kind).toBe('limited');
    expect((await fetchScopusAuthor('1', 'K', respond(500))).kind).toBe('error');
    expect((await fetchScopusAuthor('1', 'K', respond(200, {}))).kind).toBe('not_found');
  });

  it('never throws on a network failure', async () => {
    const down = (async () => {
      throw new Error('offline');
    }) as typeof fetch;
    expect(await fetchScopusAuthor('1', 'K', down)).toEqual({ kind: 'error', message: 'offline' });
  });
});
