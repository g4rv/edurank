import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({
  db: {
    staff: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'me',
        isNpp: true,
        lastName: 'А',
        firstName: 'Б',
        patronymic: 'В',
      }),
    },
  },
}));

import { auth } from '@/lib/auth';
import { authoriseQualifications } from './guard';
import { QUALIFICATIONS_FROZEN_DETAIL } from '@/lib/staff/profile-freeze';

const as = (role: string) =>
  vi.mocked(auth).mockResolvedValue({ user: { id: 'u', role, staffId: 'me' } } as never);

describe('стажування freeze', () => {
  beforeEach(() => vi.clearAllMocks());

  it('refuses a plain НПП every write on their own records', async () => {
    as('USER');
    expect(await authoriseQualifications('me', 'write')).toEqual({
      error: QUALIFICATIONS_FROZEN_DETAIL,
    });
  });

  it('still lets them read', async () => {
    as('USER');
    expect(await authoriseQualifications('me', 'read')).toMatchObject({ ok: true });
  });

  it('leaves ADMIN writing', async () => {
    as('ADMIN');
    expect(await authoriseQualifications('me', 'write')).toMatchObject({ ok: true });
  });
});
