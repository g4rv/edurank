import { describe, expect, it } from 'vitest';
import { normaliseOrcid, orcidUrl } from './orcid';

describe('normaliseOrcid', () => {
  it('keeps a canonical identifier', () => {
    expect(normaliseOrcid('0000-0002-1825-0097')).toBe('0000-0002-1825-0097');
  });

  it('adds the hyphens back', () => {
    expect(normaliseOrcid('0000000218250097')).toBe('0000-0002-1825-0097');
  });

  // The checksum character may be X, and a digits-only test would reject one
  // ORCID in ten.
  it('accepts an X checksum, in either case', () => {
    expect(normaliseOrcid('0000-0002-1694-233x')).toBe('0000-0002-1694-233X');
    expect(normaliseOrcid('0000-0002-1694-233X')).toBe('0000-0002-1694-233X');
  });

  // What people actually paste — the whole address off the profile page.
  it.each([
    'https://orcid.org/0000-0002-1825-0097',
    'http://orcid.org/0000-0002-1825-0097',
    'https://www.orcid.org/0000-0002-1825-0097',
    'orcid.org/0000-0002-1825-0097',
    'https://orcid.org/0000-0002-1825-0097/',
    '  0000-0002-1825-0097  ',
  ])('strips %s down to the identifier', (input) => {
    expect(normaliseOrcid(input)).toBe('0000-0002-1825-0097');
  });

  it('returns null for anything that is not an ORCID', () => {
    expect(normaliseOrcid(null)).toBeNull();
    expect(normaliseOrcid(undefined)).toBeNull();
    expect(normaliseOrcid('')).toBeNull();
    expect(normaliseOrcid('   ')).toBeNull();
    expect(normaliseOrcid('не вказано')).toBeNull();
    expect(normaliseOrcid('0000-0002-1825')).toBeNull();
    expect(normaliseOrcid('0000-0002-1825-00977')).toBeNull();
    // X is the checksum character only — it is not a digit anywhere else.
    expect(normaliseOrcid('0000-0002-18X5-0097')).toBeNull();
    // A Scopus link is a link, but it is not this one.
    expect(
      normaliseOrcid('https://www.scopus.com/authid/detail.uri?authorId=7004212771')
    ).toBeNull();
  });
});

describe('orcidUrl', () => {
  it('builds the profile address from the identifier', () => {
    expect(orcidUrl('0000000218250097')).toBe('https://orcid.org/0000-0002-1825-0097');
  });

  // Never guess an address for something unrecognised: it would send an editor
  // to a 404 that looks like the person's own page.
  it('is null when the value is not an ORCID', () => {
    expect(orcidUrl('щось інше')).toBeNull();
    expect(orcidUrl(null)).toBeNull();
  });
});
