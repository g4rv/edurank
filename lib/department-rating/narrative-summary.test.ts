import { describe, expect, it } from 'vitest';
import { entrySummary, isBlank } from './narrative-summary';

const boxes = [{ key: 'title' }, { key: 'customer' }, { key: 'funding' }] as const;

describe('entrySummary', () => {
  it('names an entry by its first filled box and counts what is filled', () => {
    expect(entrySummary({ title: '', customer: 'МОН, №12', funding: '250 тис.' }, boxes)).toEqual({
      title: 'МОН, №12',
      filled: 2,
      total: 3,
    });
  });

  it('ignores boxes holding only spaces', () => {
    expect(entrySummary({ title: '   ', customer: '', funding: '' }, boxes)).toEqual({
      title: null,
      filled: 0,
      total: 3,
    });
  });

  it('counts a chosen kind as a filled box, and no choice as empty', () => {
    const specs = [{ key: 'kind' }, { key: 'text' }];
    expect(entrySummary({ kind: 'на розвиток освіти', text: '' }, specs)).toEqual({
      title: 'на розвиток освіти',
      filled: 1,
      total: 2,
    });
    expect(entrySummary({ kind: null, text: '' }, specs)).toEqual({
      title: null,
      filled: 0,
      total: 2,
    });
  });
});

describe('isBlank', () => {
  it('is true for an entry with nothing in it', () => {
    expect(isBlank({ a: '', b: ' ', c: null })).toBe(true);
    expect(isBlank({ a: '', b: 'x' })).toBe(false);
  });
});
