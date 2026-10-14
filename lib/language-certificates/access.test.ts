import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({
  db: {
    staff: { findUnique: vi.fn() },
    divisionEntityPermission: { findFirst: vi.fn() },
    divisionFieldPermission: { findMany: vi.fn() },
  },
}));

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { authoriseCertificateWrite } from './access';

const mockAuth = auth as unknown as Mock;
const mockStaff = db.staff.findUnique as unknown as Mock;
const mockEntityPerm = db.divisionEntityPermission.findFirst as unknown as Mock;
const mockFieldPerms = db.divisionFieldPermission.findMany as unknown as Mock;

const DENIED = { error: 'Недостатньо прав' };

/** `db.staff.findUnique` serves the owner lookup and the editor's division. */
function lookups(owner: { role?: string; isNpp?: boolean } | null = {}, divisionId = 'div-1') {
  mockStaff.mockImplementation(async (args: { where: { id: string }; select?: object }) => {
    const select = (args.select ?? {}) as Record<string, boolean>;
    if (select.divisionId) return { divisionId };
    return owner === null ? null : { id: args.where.id, role: 'USER', isNpp: true, ...owner };
  });
}

const signIn = (role: 'ADMIN' | 'EDITOR' | 'USER', staffId: string | null) =>
  mockAuth.mockResolvedValue({ user: { id: staffId ?? 'acct', role, staffId } });

beforeEach(() => {
  vi.clearAllMocks();
  mockEntityPerm.mockResolvedValue(null);
  mockFieldPerms.mockResolvedValue([]);
});

describe('authoriseCertificateWrite', () => {
  it('lets the НПП write their own', async () => {
    signIn('USER', 'npp-1');
    lookups();
    expect(await authoriseCertificateWrite('npp-1', 'ENGLISH')).toEqual({
      ok: true,
      userId: 'npp-1',
    });
  });

  it('lets ADMIN write anybody’s', async () => {
    signIn('ADMIN', 'a1');
    lookups();
    expect(await authoriseCertificateWrite('npp-1', 'UKRAINIAN')).toMatchObject({ ok: true });
  });

  it('refuses another НПП and a head (an ordinary USER)', async () => {
    signIn('USER', 'npp-2');
    lookups();
    expect(await authoriseCertificateWrite('npp-1', 'ENGLISH')).toEqual(DENIED);
  });

  it('refuses nobody-signed-in and an unknown person', async () => {
    mockAuth.mockResolvedValue(null);
    expect(await authoriseCertificateWrite('npp-1', 'ENGLISH')).toEqual(DENIED);
    signIn('ADMIN', 'a1');
    lookups(null);
    expect(await authoriseCertificateWrite('ghost', 'ENGLISH')).toEqual({
      error: 'Працівника не знайдено',
    });
  });

  it('gives nobody anything on an administrative record, ADMIN included', async () => {
    signIn('ADMIN', 'a1');
    lookups({ isNpp: false });
    expect(await authoriseCertificateWrite('adm-1', 'ENGLISH')).toEqual(DENIED);
  });

  describe('an EDITOR', () => {
    beforeEach(() => signIn('EDITOR', 'ed-1'));

    it('needs STAFF UPDATE and the grant for THIS certificate', async () => {
      lookups();
      mockEntityPerm.mockResolvedValue({ id: 'p' });
      mockFieldPerms.mockResolvedValue([{ fieldName: 'englishCertificate' }]);
      expect(await authoriseCertificateWrite('npp-1', 'ENGLISH')).toMatchObject({ ok: true });
      // The English grant is not the Ukrainian one.
      expect(await authoriseCertificateWrite('npp-1', 'UKRAINIAN')).toEqual(DENIED);
    });

    it('is refused without STAFF UPDATE, however many field grants it holds', async () => {
      lookups();
      mockEntityPerm.mockResolvedValue(null);
      mockFieldPerms.mockResolvedValue([
        { fieldName: 'englishCertificate' },
        { fieldName: 'ukrainianCertificate' },
      ]);
      expect(await authoriseCertificateWrite('npp-1', 'ENGLISH')).toEqual(DENIED);
    });

    it('is refused on an editor’s or admin’s record (canMutateStaffRecord)', async () => {
      lookups({ role: 'ADMIN' });
      mockEntityPerm.mockResolvedValue({ id: 'p' });
      mockFieldPerms.mockResolvedValue([{ fieldName: 'englishCertificate' }]);
      expect(await authoriseCertificateWrite('admin-1', 'ENGLISH')).toEqual(DENIED);
    });

    it('is refused with no division at all', async () => {
      mockStaff.mockImplementation(async (args: { select?: Record<string, boolean> }) =>
        args.select?.divisionId ? { divisionId: null } : { id: 'npp-1', role: 'USER', isNpp: true }
      );
      expect(await authoriseCertificateWrite('npp-1', 'ENGLISH')).toEqual(DENIED);
    });

    it('may write its OWN certificate with no grant at all', async () => {
      lookups();
      expect(await authoriseCertificateWrite('ed-1', 'ENGLISH')).toMatchObject({ ok: true });
    });
  });
});
