import { describe, expect, it } from 'vitest';
import { compareItemNumbers, snapshotToGroups } from './achievement-rows';
import { ACTIVITY_STATUS_LABELS } from './labels';

describe('compareItemNumbers', () => {
  it('orders by section first', () => {
    expect(compareItemNumbers('1.5', '3.1')).toBeLessThan(0);
    expect(compareItemNumbers('5.1', '2.9')).toBeGreaterThan(0);
  });

  // The reason this exists: plain string sort puts "1.10" before "1.9"
  it('compares the item part as a number, not as text', () => {
    expect(compareItemNumbers('1.9', '1.10')).toBeLessThan(0);
    expect(compareItemNumbers('3.24', '3.3')).toBeGreaterThan(0);
  });

  it('treats equal numbers as equal, so the original order survives', () => {
    expect(compareItemNumbers('3.24', '3.24')).toBe(0);
  });

  it('sorts unknown item numbers last', () => {
    expect(compareItemNumbers('', '1.1')).toBeGreaterThan(0);
    expect(compareItemNumbers('1.1', '')).toBeLessThan(0);
    expect(compareItemNumbers('', '')).toBe(0);
  });

  it('sorts a realistic list the way the form numbers it', () => {
    const sorted = ['3.24', '1.10', '', '1.9', '2.1', '1.2'].sort(compareItemNumbers);
    expect(sorted).toEqual(['1.2', '1.9', '1.10', '2.1', '3.24', '']);
  });
});

describe('snapshotToGroups', () => {
  const snapshot = {
    closedAt: '2026-12-31T00:00:00.000Z',
    total: 650,
    sections: [
      {
        number: 1,
        title: 'Розділ 1',
        subtotal: 50,
        items: [
          {
            id: 'a2',
            itemNumber: '1.10',
            label: 'Пізніший пункт',
            summary: '',
            score: 20,
            status: 'APPROVED' as const,
            statusLabel: 'Підтверджено', // the word frozen in before the rename
          },
          {
            id: 'a1',
            itemNumber: '1.9',
            label: 'Раніший пункт',
            summary: 'деталі',
            score: 30,
            status: 'APPROVED' as const,
            statusLabel: 'Підтверджено',
          },
        ],
      },
    ],
  };

  it('returns null when there is no snapshot to render', () => {
    expect(snapshotToGroups(null)).toBeNull();
    expect(snapshotToGroups(undefined)).toBeNull();
    expect(snapshotToGroups({})).toBeNull();
  });

  it('keeps the section and its scores', () => {
    const groups = snapshotToGroups(snapshot)!;
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ number: 1, title: 'Розділ 1' });
    expect(groups[0].items.map((i) => i.score)).toEqual([30, 20]);
  });

  it('sorts items by item number', () => {
    const groups = snapshotToGroups(snapshot)!;
    expect(groups[0].items.map((i) => i.itemNumber)).toEqual(['1.9', '1.10']);
  });

  // A closed year stores the status word as text. Renaming the constant must
  // still reach those rows — the word is presentation, not frozen data.
  it('re-reads the status word from the current labels, not the stored one', () => {
    const groups = snapshotToGroups(snapshot)!;
    for (const item of groups[0].items) {
      expect(item.statusLabel).toBe(ACTIVITY_STATUS_LABELS.APPROVED);
      expect(item.statusLabel).not.toBe('Підтверджено');
    }
  });

  it('renders a closed year as read-only', () => {
    const groups = snapshotToGroups(snapshot)!;
    for (const item of groups[0].items) {
      expect(item.canDelete).toBe(false);
      expect(item.removeReason).toBeNull();
    }
  });
});
