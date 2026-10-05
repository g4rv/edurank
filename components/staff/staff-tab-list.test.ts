import { describe, expect, it } from 'vitest';
import { staffTabList } from './staff-tab-list';

const keys = (tabs: { key: string }[]) => tabs.map((t) => t.key);

describe('staffTabList', () => {
  it('gives a record its three tabs by default', () => {
    expect(staffTabList({ root: '/staff/s1' })).toEqual([
      { key: 'profile', label: 'Профіль', href: '/staff/s1' },
      { key: 'rating', label: 'Рейтинг', href: '/staff/s1/rating' },
      { key: 'kharakterystyka', label: 'Характеристика', href: '/staff/s1/kharakterystyka' },
    ]);
  });

  // ADMIN and «Перевірка науки» only (D43) — and the page checks it again.
  it('adds «Наукова робота» only for somebody who oversees science', () => {
    expect(staffTabList({ root: '/staff/s1', showScience: true }).at(-1)).toEqual({
      key: 'science',
      label: 'Наукова робота',
      href: '/staff/s1/science',
    });
    expect(keys(staffTabList({ root: '/staff/s1', showScience: false }))).not.toContain('science');
  });

  // A завідувач reads the Характеристика alone; an overseer flag must not
  // smuggle the other tabs back in for them.
  it('keeps a head to the Характеристика when the staff pages are not theirs', () => {
    expect(keys(staffTabList({ root: '/staff/s1', showStaffPages: false }))).toEqual([
      'kharakterystyka',
    ]);
  });
});
