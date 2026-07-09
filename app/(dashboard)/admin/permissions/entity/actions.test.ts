import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('redirected');
  }),
}));
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({
  db: {
    divisionEntityPermission: { upsert: vi.fn(), deleteMany: vi.fn() },
  },
}));

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { setEntityPermission } from './actions';

const mockAuth = auth as unknown as Mock;
const mockUpsert = db.divisionEntityPermission.upsert as unknown as Mock;
const mockDeleteMany = db.divisionEntityPermission.deleteMany as unknown as Mock;

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN', staffId: null } });
});

describe('setEntityPermission', () => {
  it('rejects EDITOR — permissions are ADMIN-only', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'e1', role: 'EDITOR', staffId: 's1' } });
    expect(await setEntityPermission('div-1', 'STAFF', 'CREATE', true)).toEqual({
      error: 'Недостатньо прав',
    });
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('grants an entity permission as ADMIN', async () => {
    mockUpsert.mockResolvedValue({});
    expect(await setEntityPermission('div-1', 'STAFF', 'CREATE', true)).toBeNull();
    expect(mockUpsert).toHaveBeenCalledWith({
      where: {
        divisionId_entity_action: { divisionId: 'div-1', entity: 'STAFF', action: 'CREATE' },
      },
      create: { divisionId: 'div-1', entity: 'STAFF', action: 'CREATE' },
      update: {},
    });
  });

  it('revokes an entity permission as ADMIN', async () => {
    mockDeleteMany.mockResolvedValue({});
    expect(await setEntityPermission('div-1', 'STAFF', 'CREATE', false)).toBeNull();
    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { divisionId: 'div-1', entity: 'STAFF', action: 'CREATE' },
    });
  });
});
