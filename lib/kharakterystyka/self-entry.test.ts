import { describe, expect, it } from 'vitest';
import { SELF_TYPEABLE_POSITIONS, typeEntryProblem, deleteEntryProblem } from './self-entry';

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

const deleting = (over: Record<string, unknown> = {}) =>
  deleteEntryProblem({
    ...OWNER,
    ratingOpen: true,
    entry: {
      staffId: 'her-staff',
      position: 15,
      source: 'MANUAL',
      createdBy: 'her-user',
      ...((over.entry as object) ?? {}),
    },
    ...over,
  } as Parameters<typeof deleteEntryProblem>[0]);

describe('SELF_TYPEABLE_POSITIONS', () => {
  it('is exactly п.15 and п.20', () => {
    // The two positions no rating indicator feeds — verified against
    // LICENCE_POSITION_LINKS, which maps nothing to either. Widening this list
    // is the one change that could let somebody assert a publication they do
    // not have, so it is pinned by a test rather than left to a code review.
    expect([...SELF_TYPEABLE_POSITIONS]).toEqual([15, 20]);
  });
});

describe('typeEntryProblem', () => {
  it('lets an НПП type their own п.15 and п.20', () => {
    expect(typing({ position: 15 })).toBeNull();
    expect(typing({ position: 20 })).toBeNull();
  });

  it('refuses every derived position', () => {
    // п.1 is the example the original ADMIN-only note gave: «a licence claim
    // about publications that exist or do not».
    for (const position of [1, 2, 5, 12, 19]) {
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
    expect(deleting({ entry: { position: 1 } })).not.toBeNull();
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
