import { describe, expect, it } from 'vitest';
import { UK, countUk, pluralUk } from './plural';

describe('pluralUk', () => {
  // The three forms, and the teens exception that catches naive versions:
  // 11 takes the «many» form even though it ends in 1.
  it.each([
    [1, 'запис'],
    [2, 'записи'],
    [4, 'записи'],
    [5, 'записів'],
    [11, 'записів'],
    [12, 'записів'],
    [14, 'записів'],
    [21, 'запис'],
    [22, 'записи'],
    [25, 'записів'],
    [101, 'запис'],
    [111, 'записів'],
    [0, 'записів'],
  ])('%i → %s', (n, expected) => {
    expect(pluralUk(n, 'запис', 'записи', 'записів')).toBe(expected);
  });
});

describe('countUk', () => {
  it('puts the number in front', () => {
    expect(countUk(1, 'запис', 'записи', 'записів')).toBe('1 запис');
    expect(countUk(5, 'запис', 'записи', 'записів')).toBe('5 записів');
  });
});

describe('UK', () => {
  it('covers the forms the screens repeat', () => {
    expect(UK.record(1)).toBe('1 запис');
    expect(UK.department(3)).toBe('3 кафедри');
    expect(UK.department(6)).toBe('6 кафедр');
    expect(UK.submission(1)).toBe('1 подання');
    expect(UK.citation(4)).toBe('4 цитування');
    expect(UK.partTimer(2)).toBe('2 сумісники');
  });
});
