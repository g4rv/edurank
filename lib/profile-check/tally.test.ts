import { describe, expect, it } from 'vitest';
import { plural, tally } from './tally';
import type { Check } from './types';

const c = (field: string, status: Check['status'], current: unknown = null): Check => ({
  field,
  current,
  shouldBe: '',
  status,
  message: null,
});

describe('plural', () => {
  const word = (n: number) => plural(n, 'помилка', 'помилки', 'помилок');
  it.each([
    [1, 'помилка'],
    [2, 'помилки'],
    [4, 'помилки'],
    [5, 'помилок'],
    [11, 'помилок'], // the teens take the last form, not «помилка»
    [12, 'помилок'],
    [21, 'помилка'],
    [22, 'помилки'],
    [100, 'помилок'],
  ])('%i → %s', (n, expected) => expect(word(n)).toBe(expected));
});

describe('tally', () => {
  it('counts each kind and leaves out the zeros', () => {
    const parts = tally([
      c('name', 'ok'),
      c('country', 'ok'),
      c('email', 'error'),
      c('links_and_ids', 'error'),
      c('affiliations', 'error'),
      c('keywords', 'info'),
    ]);
    expect(parts.map((p) => p.text)).toEqual(['2 успішно', '3 помилки', '1 рекомендація']);
  });

  it('says nothing about a kind that is absent', () => {
    expect(tally([c('name', 'ok')]).map((p) => p.text)).toEqual(['1 успішно']);
    expect(tally([])).toEqual([]);
  });

  it('does not count a number, such as the h-index, as a success', () => {
    const parts = tally([c('profile', 'ok'), c('h_index', 'ok', { all: 4, recent: 3 })]);
    expect(parts.map((p) => p.text)).toEqual(['1 успішно']);
  });

  it('counts a warning on its own, never as an error', () => {
    const parts = tally([c('most_recent_work', 'warning')]);
    expect(parts.map((p) => p.text)).toEqual(['1 попередження']);
  });
});
