import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: { staff: { findUnique: vi.fn() } } }));

import { db } from '@/lib/db';
import { accountGrantsFor, canManageAccount } from './permissions';

const mockStaffFind = db.staff.findUnique as unknown as Mock;

const editor = { role: 'EDITOR' as const, staffId: 'editor-1' };
const userTarget = { id: 'staff-1', role: 'USER' as const };
const none = { invite: false, password: false, sessions: false };

function divisionHolds(
  flags: Partial<Record<'canInviteStaff' | 'canSetPasswords' | 'canEndSessions', boolean>>
) {
  mockStaffFind.mockResolvedValue({
    division: { canInviteStaff: false, canSetPasswords: false, canEndSessions: false, ...flags },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('accountGrantsFor', () => {
  it('gives ADMIN everything without reading the database', async () => {
    const grants = await accountGrantsFor(
      { role: 'ADMIN', staffId: 'a' },
      { id: 'x', role: 'ADMIN' }
    );
    expect(grants).toEqual({ invite: true, password: true, sessions: true });
    expect(mockStaffFind).not.toHaveBeenCalled();
  });

  it('gives a USER nothing', async () => {
    expect(await accountGrantsFor({ role: 'USER', staffId: 'u' }, userTarget)).toEqual(none);
  });

  it('gives an EDITOR exactly the switches their division holds', async () => {
    divisionHolds({ canInviteStaff: true, canEndSessions: true });
    expect(await accountGrantsFor(editor, userTarget)).toEqual({
      invite: true,
      password: false,
      sessions: true,
    });
  });

  it('gives an EDITOR nothing when their division holds nothing', async () => {
    divisionHolds({});
    expect(await accountGrantsFor(editor, userTarget)).toEqual(none);
  });

  it('gives an EDITOR with no division nothing', async () => {
    mockStaffFind.mockResolvedValue({ division: null });
    expect(await accountGrantsFor(editor, userTarget)).toEqual(none);
  });

  // The takeover: «set pass» on an admin's record, then sign in as them.
  it('refuses every switch on an ADMIN or EDITOR record, however many are held', async () => {
    divisionHolds({ canInviteStaff: true, canSetPasswords: true, canEndSessions: true });
    expect(await accountGrantsFor(editor, { id: 'a', role: 'ADMIN' })).toEqual(none);
    expect(await accountGrantsFor(editor, { id: 'e2', role: 'EDITOR' })).toEqual(none);
  });

  it('refuses an EDITOR on their own record', async () => {
    divisionHolds({ canInviteStaff: true, canSetPasswords: true, canEndSessions: true });
    expect(await accountGrantsFor(editor, { id: 'editor-1', role: 'EDITOR' })).toEqual(none);
  });
});

// Owner, 2026-10-12: no credential action on an archived person, ADMIN included.
describe('accountGrantsFor — archived target', () => {
  const archivedAt = new Date('2026-09-01');

  it('gives ADMIN nothing, without reading the database', async () => {
    const grants = await accountGrantsFor(
      { role: 'ADMIN', staffId: 'a' },
      { id: 'x', role: 'USER', archivedAt }
    );
    expect(grants).toEqual(none);
    expect(mockStaffFind).not.toHaveBeenCalled();
  });

  it('gives an EDITOR nothing even when their division holds every switch', async () => {
    divisionHolds({ canInviteStaff: true, canSetPasswords: true, canEndSessions: true });
    expect(await accountGrantsFor(editor, { ...userTarget, archivedAt })).toEqual(none);
  });

  it('treats archivedAt null like an active person', async () => {
    expect(
      await accountGrantsFor({ role: 'ADMIN', staffId: 'a' }, { ...userTarget, archivedAt: null })
    ).toEqual({ invite: true, password: true, sessions: true });
  });
});

describe('canManageAccount', () => {
  it('refuses ADMIN on an archived person', async () => {
    expect(
      await canManageAccount(
        { role: 'ADMIN', staffId: 'a' },
        { ...userTarget, archivedAt: new Date() },
        'invite'
      )
    ).toBe(false);
  });

  it('answers for one action', async () => {
    divisionHolds({ canSetPasswords: true });
    expect(await canManageAccount(editor, userTarget, 'password')).toBe(true);
    expect(await canManageAccount(editor, userTarget, 'sessions')).toBe(false);
  });
});
