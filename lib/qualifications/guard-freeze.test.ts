import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/freeze/state', () => ({ freezeFor: vi.fn() }));
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
import { freezeFor } from '@/lib/freeze/state';
import { authoriseQualifications } from './guard';
import { QUALIFICATIONS_FROZEN_DETAIL } from '@/lib/staff/profile-freeze';

const as = (role: string) =>
  vi.mocked(auth).mockResolvedValue({ user: { id: 'u', role, staffId: 'me' } } as never);
// What `freezeFor` answers for the viewer — ADMIN and the whitelist are already
// folded into it (lib/freeze/rules.ts), so the guard only reads `profile`.
const frozen = (profile: boolean) =>
  vi.mocked(freezeFor).mockResolvedValue({ kharakterystyka: false, linkedRating: false, profile });

describe('стажування freeze', () => {
  beforeEach(() => vi.clearAllMocks());

  it('refuses a plain НПП every write on their own records while frozen', async () => {
    as('USER');
    frozen(true);
    expect(await authoriseQualifications('me', 'write')).toEqual({
      error: QUALIFICATIONS_FROZEN_DETAIL,
    });
  });

  it('lets a plain НПП write while the freeze is off', async () => {
    as('USER');
    frozen(false);
    expect(await authoriseQualifications('me', 'write')).toMatchObject({ ok: true });
  });

  it('still lets them read while frozen', async () => {
    as('USER');
    frozen(true);
    expect(await authoriseQualifications('me', 'read')).toMatchObject({ ok: true });
  });

  it('leaves ADMIN writing — their freeze is always empty', async () => {
    as('ADMIN');
    frozen(false);
    expect(await authoriseQualifications('me', 'write')).toMatchObject({ ok: true });
  });
});
