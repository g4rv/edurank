import { describe, expect, it } from 'vitest';
import { compareItemNumbers, snapshotToGroups, toAchievementGroups } from './achievement-rows';
import type { StaffActivity } from '@/lib/queries/list-activities';
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

// An open year renders from live rows, and each row carries its own розділ
// heading. Reading the title off the row rather than the SECTION_TITLES
// constant is what keeps a year that renames a section rendering as itself —
// the same reason closeYear freezes the template's titles into the snapshot.
describe('toAchievementGroups', () => {
  const activity = (section: number, title: string): StaffActivity =>
    ({
      id: `a-${section}`,
      evidence: {},
      computedValue: 1,
      score: 10,
      status: 'APPROVED',
      submittedByRole: 'NPP',
      removeReason: null,
      createdAt: new Date('2026-03-01'),
      activityType: {
        id: `t-${section}`,
        code: 'x',
        label: 'Показник',
        itemNumber: `${section}.1`,
        evidenceFields: [],
        section: { number: section, title },
      },
    }) as unknown as StaffActivity;

  it("titles each group from the year's own section rows", () => {
    const groups = toAchievementGroups([activity(3, 'Наука цього року')]);
    expect(groups[0]).toMatchObject({ number: 3, title: 'Наука цього року' });
  });

  // A section with nothing in it brings no title with it, so the catalogue
  // constant is the only thing left to name it.
  it('falls back to the catalogue title for a section with no rows', () => {
    const groups = toAchievementGroups([activity(3, 'Наука цього року')], [1, 3]);
    expect(groups.map((g) => g.number)).toEqual([1, 3]);
    expect(groups[0].title).toBe('Показники професійного розвитку');
    expect(groups[0].items).toEqual([]);
    expect(groups[1].title).toBe('Наука цього року');
  });
});
