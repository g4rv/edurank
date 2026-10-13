import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@/lib/db', () => ({ db: { staff: { findUnique: vi.fn() } } }));

import { db } from '@/lib/db';
import {
  canViewAnyQualifications,
  divisionAllowsQualifications,
  qualificationAccessFor,
} from './access';

const findStaff = db.staff.findUnique as unknown as Mock;

beforeEach(() => vi.clearAllMocks());

const base = {
  role: 'USER' as const,
  staffId: 'me',
  divisionAllows: false,
  ownerId: 'owner',
  ownerIsNpp: true,
};

describe('qualificationAccessFor', () => {
  it('lets the НПП read and write their own records', () => {
    expect(qualificationAccessFor({ ...base, ownerId: 'me' })).toEqual({
      read: true,
      write: true,
    });
  });

  it('lets ADMIN read and write anybody’s', () => {
    expect(qualificationAccessFor({ ...base, role: 'ADMIN', staffId: 'a' })).toEqual({
      read: true,
      write: true,
    });
  });

  it('lets an EDITOR with the switch read, and never write', () => {
    expect(qualificationAccessFor({ ...base, role: 'EDITOR', divisionAllows: true })).toEqual({
      read: true,
      write: false,
    });
  });

  it('refuses an EDITOR whose division lacks the switch', () => {
    expect(qualificationAccessFor({ ...base, role: 'EDITOR' })).toEqual({
      read: false,
      write: false,
    });
  });

  it('lets an EDITOR who is the НПП themself write their own', () => {
    expect(
      qualificationAccessFor({ ...base, role: 'EDITOR', ownerId: 'me', divisionAllows: false })
    ).toEqual({ read: true, write: true });
  });

  it('refuses another НПП, a head and a декан (they are ordinary USERs)', () => {
    expect(qualificationAccessFor(base)).toEqual({ read: false, write: false });
  });

  it('ignores a division switch on a USER', () => {
    expect(qualificationAccessFor({ ...base, divisionAllows: true })).toEqual({
      read: false,
      write: false,
    });
  });

  it('gives nobody anything on an administrative record, ADMIN included', () => {
    for (const role of ['ADMIN', 'EDITOR', 'USER'] as const) {
      expect(
        qualificationAccessFor({
          ...base,
          role,
          ownerId: 'me',
          divisionAllows: true,
          ownerIsNpp: false,
        })
      ).toEqual({ read: false, write: false });
    }
  });

  it('gives a session with no staff id no ownership', () => {
    expect(qualificationAccessFor({ ...base, staffId: null, ownerId: '' })).toEqual({
      read: false,
      write: false,
    });
  });
});

describe('divisionAllowsQualifications', () => {
  it('reads the switch for an EDITOR', async () => {
    findStaff.mockResolvedValue({ division: { canViewQualifications: true } });
    expect(await divisionAllowsQualifications({ role: 'EDITOR', staffId: 's1' })).toBe(true);
  });

  it('is false when the division has none or the switch is off', async () => {
    findStaff.mockResolvedValue({ division: null });
    expect(await divisionAllowsQualifications({ role: 'EDITOR', staffId: 's1' })).toBe(false);
    findStaff.mockResolvedValue({ division: { canViewQualifications: false } });
    expect(await divisionAllowsQualifications({ role: 'EDITOR', staffId: 's1' })).toBe(false);
  });

  it('never asks for a USER', async () => {
    expect(await divisionAllowsQualifications({ role: 'USER', staffId: 's1' })).toBe(false);
    expect(findStaff).not.toHaveBeenCalled();
  });
});

describe('canViewAnyQualifications', () => {
  it('lets ADMIN in without a query', async () => {
    expect(await canViewAnyQualifications({ role: 'ADMIN', staffId: 's1' })).toBe(true);
    expect(findStaff).not.toHaveBeenCalled();
  });

  it('follows the division for an EDITOR', async () => {
    findStaff.mockResolvedValue({ division: { canViewQualifications: true } });
    expect(await canViewAnyQualifications({ role: 'EDITOR', staffId: 's1' })).toBe(true);
  });
});
