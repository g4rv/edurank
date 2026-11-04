import { describe, expect, it, vi } from 'vitest';
import { checkPeople, checkPerson } from './run';
import type { PersonInput, PlatformChecker } from './types';

const person = (links: PersonInput['links']): PersonInput => ({
  staffId: 's1',
  name: 'Кулик Олена',
  faculty: 'F',
  department: 'D',
  links,
});

const fakeOrcid: PlatformChecker = {
  platform: 'orcid',
  implemented: true,
  check: vi.fn(async (link) => ({
    platform: 'orcid' as const,
    link,
    status: 'ok' as const,
    checks: [],
  })),
};
const placeholder = (platform: PlatformChecker['platform']): PlatformChecker => ({
  platform,
  implemented: false,
  check: vi.fn(async (link) => ({
    platform,
    link,
    status: 'not_implemented' as const,
    checks: [],
  })),
});
const checkers = {
  orcid: fakeOrcid,
  wos: placeholder('wos'),
  scopus: placeholder('scopus'),
  googleScholar: placeholder('googleScholar'),
};
const now = () => new Date('2026-11-04T00:00:00Z');

describe('checkPerson', () => {
  it('reports every platform, in a fixed order', async () => {
    const r = await checkPerson(person({ orcid: '0000-0002-1825-0097', wos: 'https://w/x' }), {
      checkers,
      now,
    });
    expect(r.platforms.map((p) => [p.platform, p.status])).toEqual([
      ['orcid', 'ok'],
      ['wos', 'not_implemented'],
      ['scopus', 'no_link'],
      ['googleScholar', 'no_link'],
    ]);
  });

  it('treats a blank link as no link and never calls a placeholder', async () => {
    const r = await checkPerson(person({ orcid: '  ', scopus: 'https://s/x' }), { checkers, now });
    expect(r.platforms.find((p) => p.platform === 'orcid')?.status).toBe('no_link');
    expect(checkers.scopus.check).not.toHaveBeenCalled();
  });
});

describe('checkPeople', () => {
  it('keeps the input order whatever finishes first', async () => {
    const people = ['a', 'b', 'c', 'd', 'e'].map((id) => ({
      ...person({ orcid: id }),
      staffId: id,
    }));
    const results = await checkPeople(people, { checkers, now, concurrency: 3 });
    expect(results.map((r) => r.staffId)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});
