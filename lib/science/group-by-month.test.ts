import { describe, expect, it } from 'vitest';
import { groupByMonth } from './group-by-month';

describe('groupByMonth', () => {
  it('groups newest month first and keeps the order inside a month', () => {
    const rows = [
      { id: 'a', executedMonth: '2026-09' },
      { id: 'b', executedMonth: '2027-01' },
      { id: 'c', executedMonth: '2026-09' },
    ];
    expect(groupByMonth(rows)).toEqual([
      { month: '2027-01', rows: [{ id: 'b', executedMonth: '2027-01' }] },
      {
        month: '2026-09',
        rows: [
          { id: 'a', executedMonth: '2026-09' },
          { id: 'c', executedMonth: '2026-09' },
        ],
      },
    ]);
  });

  it('returns nothing for nothing', () => {
    expect(groupByMonth([])).toEqual([]);
  });
});
