import { describe, expect, it } from 'vitest';
import { summarise } from './trend';

describe('summarise', () => {
  it('adds the points and finds the middle', () => {
    expect(summarise(2026, [10, 30, 20])).toEqual({ year: 2026, total: 60, median: 20, count: 3 });
  });

  it('takes the mean of the two middle people when the count is even', () => {
    expect(summarise(2026, [10, 20, 30, 40]).median).toBe(25);
  });

  it('rounds the sum, so 0,1 + 0,2 does not print 0,30000000000000004', () => {
    expect(summarise(2026, [0.1, 0.2]).total).toBe(0.3);
  });

  it('is all zeros for a year nobody scored in', () => {
    expect(summarise(2027, [])).toEqual({ year: 2027, total: 0, median: 0, count: 0 });
  });
});
