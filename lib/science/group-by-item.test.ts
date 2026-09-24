import { describe, expect, it } from 'vitest';
import { groupByItem } from './group-by-item';

describe('groupByItem', () => {
  it('puts a пункт typed twice apart into ONE group', () => {
    const groups = groupByItem([
      { itemNumber: '1', id: 'a' },
      { itemNumber: '8', id: 'b' },
      { itemNumber: '1', id: 'c' },
    ]);
    expect(groups.map((g) => g.itemNumber)).toEqual(['1', '8']);
    expect(groups[0].rows.map((r) => r.id)).toEqual(['a', 'c']);
  });

  it('sorts numerically, so 12 comes after 8', () => {
    const groups = groupByItem([{ itemNumber: '12' }, { itemNumber: '8' }, { itemNumber: '2' }]);
    expect(groups.map((g) => g.itemNumber)).toEqual(['2', '8', '12']);
  });

  it('returns nothing for no rows', () => {
    expect(groupByItem([])).toEqual([]);
  });
});
