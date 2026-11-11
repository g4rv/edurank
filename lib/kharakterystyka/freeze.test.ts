import { describe, expect, it } from 'vitest';
import {
  ADMIN_EXEMPT_NOTE,
  ADMIN_FREEZE_NOTE,
  adminFreezeNote,
  KHARAKTERYSTYKA_FROZEN_DETAIL,
  LINKED_RATING_FROZEN_DETAIL,
  feedsKharakterystyka,
  linkedRatingProblem,
} from './freeze';
import { removeLineProblem, typeEntryProblem } from './self-entry';
import { NO_FREEZE, NOTHING_FROZEN, type Freeze, type FreezeSettings } from '@/lib/freeze/rules';

// The switches are read from the database since 2026-11-11 (lib/freeze). What
// reaches these helpers is the viewer's `Freeze` — ADMIN and the whitelist are
// already folded into it — so both states are tested here, every time.
const LINKED = [{ position: 1 }];
const UNLINKED: unknown[] = [];
const closed = (over: Partial<Freeze>): Freeze => ({ ...NO_FREEZE, ...over });
const settings = (over: Partial<FreezeSettings>): FreezeSettings => ({
  ...NOTHING_FROZEN,
  ...over,
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
  it('refuses a linked indicator while the viewer is frozen', () => {
    expect(linkedRatingProblem(closed({ linkedRating: true }), LINKED)).toBe(
      LINKED_RATING_FROZEN_DETAIL
    );
  });

  it('leaves an indicator that feeds nothing open, frozen or not', () => {
    expect(linkedRatingProblem(closed({ linkedRating: true }), UNLINKED)).toBeNull();
    expect(linkedRatingProblem(NO_FREEZE, UNLINKED)).toBeNull();
  });

  it('leaves everything open while the switch is off', () => {
    expect(linkedRatingProblem(NO_FREEZE, LINKED)).toBeNull();
  });

  it('reads its own switch, not the document’s', () => {
    expect(linkedRatingProblem(closed({ kharakterystyka: true }), LINKED)).toBeNull();
  });
});

describe('the document itself', () => {
  const who = { ownStaffId: 'her-staff', ownUserId: 'her-user', ratingOpen: true };
  const frozen = closed({ kharakterystyka: true });

  it('refuses an НПП to type a row for themselves while frozen', () => {
    expect(
      typeEntryProblem({
        ...who,
        role: 'USER',
        freeze: frozen,
        targetStaffId: 'her-staff',
        position: 15,
      })
    ).toBe(KHARAKTERYSTYKA_FROZEN_DETAIL);
  });

  it('refuses an НПП to remove a line of their own document while frozen', () => {
    expect(
      removeLineProblem({ ...who, role: 'USER', freeze: frozen, targetStaffId: 'her-staff' })
    ).toBe(KHARAKTERYSTYKA_FROZEN_DETAIL);
  });

  it('lets them type and remove while open', () => {
    expect(
      typeEntryProblem({
        ...who,
        role: 'USER',
        freeze: NO_FREEZE,
        targetStaffId: 'her-staff',
        position: 15,
      })
    ).toBeNull();
    expect(
      removeLineProblem({ ...who, role: 'USER', freeze: NO_FREEZE, targetStaffId: 'her-staff' })
    ).toBeNull();
  });

  it('still lets ADMIN type and remove, for anybody, whatever the freeze says', () => {
    expect(
      typeEntryProblem({
        ...who,
        role: 'ADMIN',
        freeze: frozen,
        targetStaffId: 'his-staff',
        position: 1,
      })
    ).toBeNull();
    expect(
      removeLineProblem({ ...who, role: 'ADMIN', freeze: frozen, targetStaffId: 'his-staff' })
    ).toBeNull();
  });
});

describe("adminFreezeNote — what ADMIN is told on a person's record", () => {
  it('tells ADMIN that the Характеристика and its rating indicators are blocked', () => {
    expect(adminFreezeNote('ADMIN', settings({ kharakterystykaFrozen: true }))).toBe(
      ADMIN_FREEZE_NOTE
    );
    expect(adminFreezeNote('ADMIN', settings({ linkedRatingFrozen: true }))).toBe(
      ADMIN_FREEZE_NOTE
    );
    expect(adminFreezeNote('ADMIN', settings({ allFrozen: true }))).toBe(ADMIN_FREEZE_NOTE);
    expect(ADMIN_FREEZE_NOTE).toBe(
      'Характеристика та відповідні показники рейтингу заблоковані для НПП'
    );
  });

  // The person whose record it is may be on the whitelist: then the line that
  // says «заблоковані» would be wrong about them (owner, 2026-11-11).
  it('says the person is exempt when they are on the whitelist', () => {
    expect(adminFreezeNote('ADMIN', settings({ allFrozen: true }), true)).toBe(ADMIN_EXEMPT_NOTE);
  });

  it('says nothing while only the profile is frozen, or nothing is', () => {
    expect(adminFreezeNote('ADMIN', settings({ profileFrozen: true }))).toBeNull();
    expect(adminFreezeNote('ADMIN', NOTHING_FROZEN)).toBeNull();
    expect(adminFreezeNote('ADMIN', NOTHING_FROZEN, true)).toBeNull();
  });

  it('says nothing to anybody else — they get the read-only note instead', () => {
    for (const role of ['USER', 'EDITOR', undefined]) {
      expect(adminFreezeNote(role, settings({ allFrozen: true }))).toBeNull();
    }
  });
});
