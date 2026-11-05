import { describe, expect, it } from 'vitest';
import { needsCheck, runCounts } from './pending';

describe('needsCheck', () => {
  it('has nothing to ask when the person has no link there', () => {
    expect(needsCheck(null, undefined)).toBe(false);
    expect(needsCheck('  ', undefined)).toBe(false);
    expect(needsCheck(undefined, { status: 'failed' })).toBe(false);
  });

  it('needs the person never checked', () => {
    expect(needsCheck('https://x/y', undefined)).toBe(true);
  });

  it('needs the person whose last attempt failed — there is no answer yet', () => {
    expect(needsCheck('https://x/y', { status: 'failed' })).toBe(true);
  });

  it('needs the person stored as «no link» who has since got one', () => {
    expect(needsCheck('https://x/y', { status: 'no_link' })).toBe(true);
  });

  it('does not need an answer already given, bad or good', () => {
    for (const status of ['ok', 'warning', 'error']) {
      expect(needsCheck('https://x/y', { status })).toBe(false);
    }
  });
});

describe('runCounts', () => {
  const people = [
    { staffId: 'a', links: { googleScholar: 'https://s/a' } }, // checked
    { staffId: 'b', links: { googleScholar: 'https://s/b' } }, // failed
    { staffId: 'c', links: { googleScholar: 'https://s/c' } }, // never
    { staffId: 'd', links: { orcid: '0000' } }, // no Scholar link
  ];
  const stored = new Map<string, Partial<Record<'googleScholar', { status: string }>>>([
    ['a', { googleScholar: { status: 'ok' } }],
    ['b', { googleScholar: { status: 'failed' } }],
  ]);

  it('counts everyone with a link, and those with no answer', () => {
    expect(runCounts(people, stored, 'googleScholar')).toEqual({ all: 3, missing: 2 });
  });

  it('narrows to the people in scope (the «Є проблеми» filter)', () => {
    expect(runCounts(people, stored, 'googleScholar', new Set(['b', 'c']))).toEqual({
      all: 2,
      missing: 2,
    });
    expect(runCounts(people, stored, 'googleScholar', new Set(['a']))).toEqual({
      all: 1,
      missing: 0,
    });
  });
});
