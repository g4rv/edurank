import { describe, expect, it } from 'vitest';
import { SELF_TYPEABLE_POSITIONS, typeEntryProblem, deleteEntryProblem } from './self-entry';
import { positionEvidenceFields } from './position-evidence';

const ADMIN = { role: 'ADMIN' as const, ownStaffId: 'admin-staff', ownUserId: 'admin-user' };
const OWNER = { role: 'USER' as const, ownStaffId: 'her-staff', ownUserId: 'her-user' };

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
  it('is every position that has a form — all but the military three', () => {
    // Pinned rather than left to a code review, because this list decides who
    // may assert a licence position about themselves. It was [15, 20] until
    // 2026-09-22; see the note on the export for what widening it accepts.
    expect([...SELF_TYPEABLE_POSITIONS]).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 19, 20,
    ]);
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
  it('lets an НПП type any position that has a form', () => {
    // Including the derived ones (owner, 2026-09-22). The 2022–2024 import left
    // positions empty that people genuinely satisfy, and the person it is about
    // is the only one who can repair that.
    for (const position of [1, 2, 5, 12, 15, 19, 20]) {
      expect(typing({ position })).toBeNull();
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

  it('refuses a row an administrator typed for them', () => {
    // Mirrors the rating: an НПП deletes their own submission, never one
    // somebody else put there.
    expect(deleting({ entry: { createdBy: 'admin-user' } })).not.toBeNull();
  });

  it('refuses an imported row for everybody, ADMIN included', () => {
    // 6 422 of these carry the 2022–2024 history. The importer rewrites them
    // wholesale, so a delete here would reappear on the next run.
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

  it('refuses a position an НПП may not type, even if they somehow own the row', () => {
    expect(deleting({ entry: { position: 17 } })).not.toBeNull();
  });

  it('lets an НПП remove a derived-position row they typed themselves', () => {
    // п.1 is typeable now, so it is deletable by whoever typed it — the two
    // rules read the same list, and a row you may write but never remove is a
    // mistake with no way back.
    expect(deleting({ entry: { position: 1 } })).toBeNull();
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
