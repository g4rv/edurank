import { describe, expect, it } from 'vitest';
import {
  ADMIN_FREEZE_NOTE,
  adminFreezeNote,
  KHARAKTERYSTYKA_FROZEN,
  KHARAKTERYSTYKA_FREEZES_LINKED_RATING,
  KHARAKTERYSTYKA_FROZEN_DETAIL,
  LINKED_RATING_FROZEN_DETAIL,
  feedsKharakterystyka,
  kharakterystykaFrozenFor,
  linkedRatingProblem,
} from './freeze';
import { removeLineProblem, typeEntryProblem } from './self-entry';

// The freeze is temporarily OFF (owner, 2026-11-06). The tests of the frozen
// mechanics run only while their constant is on, so they come back by
// themselves when it is switched on again; the open state has its own tests.
const LINKED = [{ position: 1 }];
const UNLINKED: unknown[] = [];

describe('the freeze switches', () => {
  it('are both off for now — temporary unfreeze, 2026-11-06', () => {
    expect(KHARAKTERYSTYKA_FROZEN).toBe(false);
    expect(KHARAKTERYSTYKA_FREEZES_LINKED_RATING).toBe(false);
  });
});

describe.skipIf(KHARAKTERYSTYKA_FROZEN || KHARAKTERYSTYKA_FREEZES_LINKED_RATING)(
  'while it is open',
  () => {
    it('lets everybody type, remove and delete', () => {
      expect(kharakterystykaFrozenFor('USER')).toBe(false);
      expect(kharakterystykaFrozenFor('EDITOR')).toBe(false);
      expect(linkedRatingProblem('USER', LINKED)).toBeNull();
      expect(adminFreezeNote('ADMIN')).toBeNull();
    });
  }
);

describe('feedsKharakterystyka', () => {
  it('is true for an indicator that feeds a position', () => {
    expect(feedsKharakterystyka(LINKED)).toBe(true);
  });

  it('is false for an indicator that feeds none, or has malformed links', () => {
    expect(feedsKharakterystyka(UNLINKED)).toBe(false);
    expect(feedsKharakterystyka(null)).toBe(false);
    expect(feedsKharakterystyka('nonsense')).toBe(false);
  });
});

describe('linkedRatingProblem', () => {
  describe.skipIf(!KHARAKTERYSTYKA_FREEZES_LINKED_RATING)('while frozen', () => {
    it.each(['USER', 'EDITOR'])('refuses a linked indicator to %s', (role) => {
      expect(linkedRatingProblem(role, LINKED)).toBe(LINKED_RATING_FROZEN_DETAIL);
    });
  });

  it('leaves an indicator that feeds nothing open', () => {
    expect(linkedRatingProblem('USER', UNLINKED)).toBeNull();
  });

  it('never refuses ADMIN', () => {
    expect(linkedRatingProblem('ADMIN', LINKED)).toBeNull();
  });
});

describe('the document itself', () => {
  const who = { ownStaffId: 'her-staff', ownUserId: 'her-user', ratingOpen: true };

  it.skipIf(!KHARAKTERYSTYKA_FROZEN)('is closed to everybody but ADMIN', () => {
    expect(kharakterystykaFrozenFor('USER')).toBe(true);
    expect(kharakterystykaFrozenFor('EDITOR')).toBe(true);
    expect(kharakterystykaFrozenFor('ADMIN')).toBe(false);
  });

  it.skipIf(!KHARAKTERYSTYKA_FROZEN)('refuses an НПП to type a row for themselves', () => {
    expect(
      typeEntryProblem({ ...who, role: 'USER', targetStaffId: 'her-staff', position: 15 })
    ).toBe(KHARAKTERYSTYKA_FROZEN_DETAIL);
  });

  it.skipIf(!KHARAKTERYSTYKA_FROZEN)(
    'refuses an НПП to remove a line of their own document',
    () => {
      expect(removeLineProblem({ ...who, role: 'USER', targetStaffId: 'her-staff' })).toBe(
        KHARAKTERYSTYKA_FROZEN_DETAIL
      );
    }
  );

  it('still lets ADMIN type and remove, for anybody', () => {
    expect(
      typeEntryProblem({ ...who, role: 'ADMIN', targetStaffId: 'his-staff', position: 1 })
    ).toBeNull();
    expect(removeLineProblem({ ...who, role: 'ADMIN', targetStaffId: 'his-staff' })).toBeNull();
  });
});

describe("adminFreezeNote — what ADMIN is told on a person's record", () => {
  it.skipIf(!KHARAKTERYSTYKA_FROZEN && !KHARAKTERYSTYKA_FREEZES_LINKED_RATING)(
    'tells ADMIN that the Характеристика and its rating indicators are blocked',
    () => {
      expect(adminFreezeNote('ADMIN')).toBe(ADMIN_FREEZE_NOTE);
      expect(ADMIN_FREEZE_NOTE).toBe(
        'Характеристика та відповідні показники рейтингу заблоковані для НПП'
      );
    }
  );

  it('says nothing to anybody else — they get the read-only note instead', () => {
    for (const role of ['USER', 'EDITOR', undefined]) {
      expect(adminFreezeNote(role)).toBeNull();
    }
  });
});
