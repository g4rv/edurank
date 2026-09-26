import { describe, expect, it } from 'vitest';
import { pageItems } from './pagination';

const E = 'ellipsis';

describe('pageItems', () => {
  it('shows every page when there are seven or fewer', () => {
    expect(pageItems(1, 1)).toEqual([1]);
    expect(pageItems(3, 6)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(pageItems(7, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('shows the first five and the last page near the start', () => {
    for (const page of [1, 2, 3, 4]) {
      expect(pageItems(page, 46)).toEqual([1, 2, 3, 4, 5, E, 46]);
    }
  });

  it('shows the current page and its neighbours in the middle', () => {
    expect(pageItems(5, 46)).toEqual([1, E, 4, 5, 6, E, 46]);
    expect(pageItems(20, 46)).toEqual([1, E, 19, 20, 21, E, 46]);
    expect(pageItems(42, 46)).toEqual([1, E, 41, 42, 43, E, 46]);
  });

  it('shows the first page and the last five near the end', () => {
    for (const page of [43, 44, 45, 46]) {
      expect(pageItems(page, 46)).toEqual([1, E, 42, 43, 44, 45, 46]);
    }
  });

  it('is always seven slots wide past seven pages, so the pager keeps its width', () => {
    for (const total of [8, 9, 20, 46]) {
      for (let page = 1; page <= total; page++) {
        expect(pageItems(page, total)).toHaveLength(7);
      }
    }
  });

  it('never repeats or skips a page number, and stays in order', () => {
    for (let page = 1; page <= 9; page++) {
      const numbers = pageItems(page, 9).filter((i): i is number => i !== E);
      expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
      expect(new Set(numbers).size).toBe(numbers.length);
      expect(numbers).toContain(page);
    }
  });
});
