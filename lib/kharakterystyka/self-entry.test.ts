import { describe, expect, it, vi } from 'vitest';

// These tests cover the rules that apply with the Характеристика open. The
// freeze has its own file (freeze.test.ts).
vi.mock('./freeze', () => ({ KHARAKTERYSTYKA_FROZEN_DETAIL: 'frozen' }));

import { NO_FREEZE } from '@/lib/freeze/rules';
import {
  SELF_TYPEABLE_POSITIONS,
  POSITION_FROM_RATING_DETAIL,
  typeEntryProblem,
  deleteEntryProblem,
  removeLineProblem,
  removePositionProblem,
} from './self-entry';

describe('removePositionProblem', () => {
  it('lets an НПП remove only on п.15 and п.20', () => {
    expect(removePositionProblem('USER', 15)).toBeNull();
    expect(removePositionProblem('USER', 20)).toBeNull();
    for (const position of [1, 2, 5, 12, 19]) {
      expect(removePositionProblem('USER', position)).toBe(POSITION_FROM_RATING_DETAIL);
    }
  });

  it('holds for an EDITOR too, and never for ADMIN', () => {
    expect(removePositionProblem('EDITOR', 1)).not.toBeNull();
    expect(removePositionProblem('ADMIN', 1)).toBeNull();
  });
});
import { positionEvidenceFields } from './position-evidence';

const ADMIN = {
  role: 'ADMIN' as const,
  ownStaffId: 'admin-staff',
  ownUserId: 'admin-user',
  freeze: NO_FREEZE,
};
const OWNER = {
  role: 'USER' as const,
  ownStaffId: 'her-staff',
  ownUserId: 'her-user',
  freeze: NO_FREEZE,
};

const typing = (over: Partial<Parameters<typeof typeEntryProblem>[0]> = {}) =>
  typeEntryProblem({
    ...OWNER,
    targetStaffId: 'her-staff',
    position: 15,
    ratingOpen: true,
    ...over,
  });

// `entry` is lifted out of the overrides and merged into the default row.
// Spreading `over` wholesale AFTER the row rebuilt `entry` from the partial
// alone, so `deleting({ entry: { createdBy: 'admin-user' } })` dropped `source`
// and was refused for being an import — a passing test that proved nothing it
// claimed to.
const deleting = ({
  entry = {},
  ...over
}: { entry?: Record<string, unknown> } & Record<string, unknown> = {}) =>
  deleteEntryProblem({
    ...OWNER,
    ratingOpen: true,
    ...over,
    entry: {
      staffId: 'her-staff',
      position: 15,
      source: 'MANUAL',
      createdBy: 'her-user',
      ...entry,
    },
  } as Parameters<typeof deleteEntryProblem>[0]);

describe('SELF_TYPEABLE_POSITIONS', () => {
  it('is only the positions the rating and the profile cannot fill', () => {
    // Pinned rather than left to a code review, because this list decides who
    // may assert a licence position about themselves (owner, 2026-11-17; it was
    // every position with a form from 2026-09-22).
    expect([...SELF_TYPEABLE_POSITIONS]).toEqual([15, 20]);
  });

  it('leaves out п.16–п.18, which have no form at all', () => {
    // «Для вищих військових навчальних закладів». The list is derived from
    // `positionEvidenceFields`, so this holds by construction — and the test
    // fails loudly if somebody ever writes a form for one of them.
    for (const position of [16, 17, 18]) {
      expect(positionEvidenceFields(position)).toHaveLength(0);
      expect(SELF_TYPEABLE_POSITIONS).not.toContain(position);
    }
  });
});

describe('typeEntryProblem', () => {
  it('lets an НПП type п.15 and п.20', () => {
    for (const position of [15, 20]) {
      expect(typing({ position })).toBeNull();
    }
  });

  it('refuses a position the rating or the profile fills', () => {
    for (const position of [1, 2, 5, 12, 19]) {
      expect(typing({ position })).toBe('Ця позиція заповнюється з рейтингу або профілю');
    }
  });

  it('refuses the military positions', () => {
    // п.16–п.18 have no form, and this university may not claim them.
    for (const position of [16, 17, 18]) {
      expect(typing({ position })).not.toBeNull();
    }
  });

  it('refuses somebody else’s record', () => {
    expect(typing({ targetStaffId: 'his-staff' })).not.toBeNull();
  });

  it('refuses while the rating is closed', () => {
    expect(typing({ ratingOpen: false })).not.toBeNull();
  });

  it('refuses an account with no staff row', () => {
    expect(typing({ ownStaffId: null })).not.toBeNull();
  });

  it('leaves ADMIN able to type any position, for anybody', () => {
    // Unchanged behaviour: this is how п.15 and п.20 were filled before, and
    // an admin still types the positions an НПП may not.
    expect(
      typeEntryProblem({ ...ADMIN, targetStaffId: 'her-staff', position: 1, ratingOpen: false })
    ).toBeNull();
    expect(
      typeEntryProblem({ ...ADMIN, targetStaffId: 'her-staff', position: 15, ratingOpen: true })
    ).toBeNull();
  });
});

describe('deleteEntryProblem', () => {
  it('lets an НПП remove a row they typed themselves', () => {
    expect(deleting()).toBeNull();
  });

  // Any line of their own document, whoever typed it (owner, 2026-10-06)
  it('lets an НПП remove a row an administrator typed for them', () => {
    expect(deleting({ entry: { createdBy: 'admin-user' } })).toBeNull();
  });

  it('refuses an imported row for everybody, ADMIN included', () => {
    // 6 422 of these carry the 2022–2024 history. They are removed from the
    // document's own line, which HIDES the row so the importer cannot bring it
    // back — this dialog's delete would erase it outright.
    expect(deleting({ entry: { source: 'IMPORT' } })).not.toBeNull();
    expect(
      deleteEntryProblem({
        ...ADMIN,
        ratingOpen: true,
        entry: { staffId: 'her-staff', position: 15, source: 'IMPORT', createdBy: 'admin-user' },
      })
    ).not.toBeNull();
  });

  it('refuses a row on somebody else’s record', () => {
    expect(deleting({ entry: { staffId: 'his-staff' } })).not.toBeNull();
  });

  it('refuses an НПП deleting a row typed on a position the rating fills', () => {
    // Typed before 2026-11-17, kept and counting — but only ADMIN takes it out
    // now: an НПП touches the document through the rating and п.15 / п.20 only.
    expect(deleting({ entry: { position: 1 } })).toBe(POSITION_FROM_RATING_DETAIL);
  });

  it('refuses while the rating is closed', () => {
    expect(deleting({ ratingOpen: false })).not.toBeNull();
  });

  it('leaves ADMIN able to remove any MANUAL row', () => {
    expect(
      deleteEntryProblem({
        ...ADMIN,
        ratingOpen: false,
        entry: { staffId: 'her-staff', position: 1, source: 'MANUAL', createdBy: 'her-user' },
      })
    ).toBeNull();
  });
});

// Any line of a Характеристика: ADMIN on anybody's, an НПП on their own while
// the rating is open to them (owner, 2026-10-06).
describe('removeLineProblem', () => {
  const NPP = {
    role: 'USER' as const,
    ownStaffId: 'her-staff',
    ownUserId: 'her-user',
    ratingOpen: true,
    freeze: NO_FREEZE,
  };

  it('lets an НПП remove a line of their own document', () => {
    expect(removeLineProblem({ ...NPP, targetStaffId: 'her-staff' })).toBeNull();
  });

  it('refuses somebody else’s document', () => {
    expect(removeLineProblem({ ...NPP, targetStaffId: 'his-staff' })).not.toBeNull();
  });

  it('refuses an НПП while the rating is closed', () => {
    expect(
      removeLineProblem({ ...NPP, ratingOpen: false, targetStaffId: 'her-staff' })
    ).not.toBeNull();
  });

  it('lets ADMIN remove a line of anybody’s, the rating open or not', () => {
    expect(
      removeLineProblem({ ...ADMIN, ratingOpen: false, targetStaffId: 'her-staff' })
    ).toBeNull();
  });
});
