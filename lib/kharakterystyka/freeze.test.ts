import { describe, expect, it } from 'vitest';
import {
  KHARAKTERYSTYKA_FROZEN,
  KHARAKTERYSTYKA_FREEZES_LINKED_RATING,
  KHARAKTERYSTYKA_FROZEN_DETAIL,
  LINKED_RATING_FROZEN_DETAIL,
  feedsKharakterystyka,
  kharakterystykaFrozenFor,
  linkedRatingProblem,
} from './freeze';
import { removeLineProblem, typeEntryProblem } from './self-entry';

// The freeze ships ON. If somebody unfreezes by flipping the constants, these
// tests describe the state they are leaving, and are the ones to update.
const LINKED = [{ position: 1 }];
const UNLINKED: unknown[] = [];

describe('the freeze ships on', () => {
  it('has both switches set', () => {
    expect(KHARAKTERYSTYKA_FROZEN).toBe(true);
    expect(KHARAKTERYSTYKA_FREEZES_LINKED_RATING).toBe(true);
  });
});

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
  it.each(['USER', 'EDITOR'])('refuses a linked indicator to %s', (role) => {
    expect(linkedRatingProblem(role, LINKED)).toBe(LINKED_RATING_FROZEN_DETAIL);
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

  it('is closed to everybody but ADMIN', () => {
    expect(kharakterystykaFrozenFor('USER')).toBe(true);
    expect(kharakterystykaFrozenFor('EDITOR')).toBe(true);
    expect(kharakterystykaFrozenFor('ADMIN')).toBe(false);
  });

  it('refuses an НПП to type a row for themselves', () => {
    expect(
      typeEntryProblem({ ...who, role: 'USER', targetStaffId: 'her-staff', position: 15 })
    ).toBe(KHARAKTERYSTYKA_FROZEN_DETAIL);
  });

  it('refuses an НПП to remove a line of their own document', () => {
    expect(removeLineProblem({ ...who, role: 'USER', targetStaffId: 'her-staff' })).toBe(
      KHARAKTERYSTYKA_FROZEN_DETAIL
    );
  });

  it('still lets ADMIN type and remove, for anybody', () => {
    expect(
      typeEntryProblem({ ...who, role: 'ADMIN', targetStaffId: 'his-staff', position: 1 })
    ).toBeNull();
    expect(removeLineProblem({ ...who, role: 'ADMIN', targetStaffId: 'his-staff' })).toBeNull();
  });
});
