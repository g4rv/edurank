import { describe, expect, it } from 'vitest';
import { fetchFeaturedEmployments } from './fetch';

const ID = '0000-0002-1825-0097';

function respond(body: unknown, status = 200): typeof fetch {
  return (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;
}

describe('fetchFeaturedEmployments', () => {
  it('collects the put-codes of the featured employments only', async () => {
    const json = {
      affiliationGroups: {
        EMPLOYMENT: [
          { affiliations: [{ putCode: { value: '1' }, featured: null }] },
          { affiliations: [{ putCode: { value: '2' }, featured: true }] },
        ],
      },
    };
    expect(await fetchFeaturedEmployments(ID, respond(json))).toEqual(new Set(['2']));
  });

  it('is an empty set, not null, when nothing is featured', async () => {
    const json = {
      affiliationGroups: { EMPLOYMENT: [{ affiliations: [{ putCode: { value: '1' } }] }] },
    };
    expect(await fetchFeaturedEmployments(ID, respond(json))).toEqual(new Set());
  });

  it('is null — unknown — on a bad status, an unknown shape or a network failure', async () => {
    expect(await fetchFeaturedEmployments(ID, respond({}, 404))).toBeNull();
    expect(await fetchFeaturedEmployments(ID, respond({ something: 'else' }))).toBeNull();
    const down = (async () => {
      throw new Error('offline');
    }) as typeof fetch;
    expect(await fetchFeaturedEmployments(ID, down)).toBeNull();
  });

  it('is null for something that is not an ORCID iD', async () => {
    expect(await fetchFeaturedEmployments('nope', respond({}))).toBeNull();
  });
});
