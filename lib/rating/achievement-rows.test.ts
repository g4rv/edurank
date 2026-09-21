import { describe, expect, it } from 'vitest';
import { compareItemNumbers, snapshotToGroups, toAchievementGroups } from './achievement-rows';
import type { StaffActivity } from '@/lib/queries/list-activities';
import type { TemplateIndicator } from '@/lib/queries/list-template-indicators';
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

  // 2025 rendered eleven scored rows and nothing else, so «Показувати
  // незаповнені» read «(0)» on the one year an НПП compares themselves
  // against. A finished year is still a whole додаток.
  describe('with the catalogue', () => {
    const indicator = (id: string, itemNumber: string, section: number): TemplateIndicator => ({
      id,
      itemNumber,
      label: `Показник ${itemNumber}`,
      inputSource: 'NPP_SUBMISSION',
      verifyingDivision: null,
      section: { number: section, title: `Розділ ${section}` },
    });

    const catalogue = [
      indicator('t-9', '1.9', 1),
      indicator('t-10', '1.10', 1),
      indicator('t-11', '1.11', 1),
      indicator('t-21', '2.1', 2),
    ];

    it('adds a zero row for every indicator the snapshot has nothing under', () => {
      const groups = snapshotToGroups(snapshot, catalogue)!;
      const added = groups[0].items.filter((i) => i.isEmpty);
      expect(added.map((i) => i.itemNumber)).toEqual(['1.11']);
      expect(added[0].score).toBe(0);
      expect(added[0].canDelete).toBe(false);
    });

    it('leaves the frozen rows alone', () => {
      const groups = snapshotToGroups(snapshot, catalogue)!;
      const scored = groups[0].items.filter((i) => !i.isEmpty);
      expect(scored.map((i) => i.score)).toEqual([30, 20]);
      expect(scored.map((i) => i.label)).toEqual(['Раніший пункт', 'Пізніший пункт']);
    });

    it('sorts the added rows in among the frozen ones', () => {
      const groups = snapshotToGroups(snapshot, catalogue)!;
      expect(groups[0].items.map((i) => i.itemNumber)).toEqual(['1.9', '1.10', '1.11']);
    });

    // «Розділ 2» said «Немає досягнень» and named none of the eleven things
    // that could have gone in it. The snapshot never wrote the section at all.
    it('brings in a section the snapshot never wrote', () => {
      const groups = snapshotToGroups(snapshot, catalogue)!;
      expect(groups.map((g) => g.number)).toEqual([1, 2]);
      expect(groups[1]).toMatchObject({ title: 'Розділ 2' });
      expect(groups[1].items.map((i) => i.itemNumber)).toEqual(['2.1']);
    });

    // A snapshot carries no ActivityType id, so the match is the наказ's own
    // number — and an indicator numbered twice over is filled either way.
    it('matches on the item number, not the label', () => {
      const renamed = [{ ...indicator('t-9', '1.9', 1), label: 'Перейменований показник' }];
      const groups = snapshotToGroups(snapshot, renamed)!;
      expect(groups[0].items.filter((i) => i.isEmpty)).toHaveLength(0);
    });

    it('is unchanged when no catalogue is passed', () => {
      expect(snapshotToGroups(snapshot)).toEqual(snapshotToGroups(snapshot, []));
    });
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

  // Passing the year's indicators fills in what the person has not done, so the
  // table is the whole rating rather than only the parts already finished.
  describe('with the catalogue', () => {
    const indicator = (
      id: string,
      itemNumber: string,
      section: number,
      inputSource: TemplateIndicator['inputSource'] = 'NPP_SUBMISSION',
      verifyingDivision: TemplateIndicator['verifyingDivision'] = null
    ): TemplateIndicator => ({
      id,
      itemNumber,
      label: `Показник ${itemNumber}`,
      inputSource,
      verifyingDivision,
      section: { number: section, title: `Розділ ${section}` },
    });

    const catalogue = [
      indicator('t-3', '3.1', 3),
      indicator('t-other', '3.2', 3),
      indicator('t-div', '3.3', 3, 'DIVISION_MANAGED', {
        name: 'Навчально-науковий відділ',
        registryKey: 'NNV',
      }),
    ];

    it('adds a zero row for every indicator with no activity', () => {
      const groups = toAchievementGroups([activity(3, 'Наука')], [3], false, catalogue);
      const items = groups[0].items;

      expect(items.map((i) => i.itemNumber)).toEqual(['3.1', '3.2', '3.3']);
      // 3.1 is the real activity, the other two are placeholders
      expect(items[0].isEmpty).toBeUndefined();
      expect(items[0].score).toBe(10);
      expect(items[1]).toMatchObject({ isEmpty: true, score: 0, statusLabel: '' });
      expect(items[2]).toMatchObject({ isEmpty: true, inputSource: 'DIVISION_MANAGED' });
    });

    it('names WHICH відділ fills a division-managed row', () => {
      // «Вносить відділ» told an НПП the row was not theirs but not who to ask,
      // which is the only thing they can act on.
      const groups = toAchievementGroups([], [3], false, catalogue);
      const divisionRow = groups[0].items.find((i) => i.itemNumber === '3.3');
      expect(divisionRow?.division).toBe('ННВ');
    });

    it('leaves the division empty on a row the person fills themselves', () => {
      const groups = toAchievementGroups([], [3], false, catalogue);
      expect(groups[0].items.find((i) => i.itemNumber === '3.1')?.division).toBeNull();
    });

    it('never duplicates an indicator the person already has', () => {
      const groups = toAchievementGroups([activity(3, 'Наука')], [3], false, catalogue);
      expect(groups[0].items.filter((i) => i.itemNumber === '3.1')).toHaveLength(1);
    });

    // Repeatable indicators mean several rows under one number — all of them
    // real, and no placeholder beside them.
    it('leaves an indicator alone when it has more than one activity', () => {
      const twice = [activity(3, 'Наука'), { ...activity(3, 'Наука'), id: 'a-3b' }];
      const groups = toAchievementGroups(twice, [3], false, [catalogue[0]]);
      expect(groups[0].items).toHaveLength(2);
      expect(groups[0].items.every((i) => !i.isEmpty)).toBe(true);
    });

    it('changes nothing when no catalogue is passed', () => {
      const groups = toAchievementGroups([activity(3, 'Наука')], [3]);
      expect(groups[0].items).toHaveLength(1);
    });
  });
});
