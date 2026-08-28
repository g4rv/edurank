import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: { staff: { findMany: vi.fn() } },
}));
vi.mock('@/lib/activation', () => ({
  INVITE_TOKEN_HOURS: 30 * 24,
  RESET_TOKEN_HOURS: 2,
  mintActivationToken: vi.fn(() => ({
    token: 'raw-token',
    tokenHash: 'raw-token-hash',
    expiresAt: new Date('2026-09-24T00:00:00Z'),
  })),
  storeActivationToken: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/mail/mailer', () => ({ sendMail: vi.fn().mockResolvedValue(undefined) }));

import { db } from '@/lib/db';
import { sendMail } from '@/lib/mail/mailer';
import { requestPasswordReset } from './actions';

const mockStaffFind = db.staff.findMany as unknown as Mock;

/**
 * The lookup is `findMany` + `take: 2`, not `findUnique`: the address is matched
 * case-insensitively, and two rows differing only in case are possible because
 * Postgres enforces `@unique` case-sensitively. So a test says «found» with a
 * one-element array and «nobody» with an empty one.
 */
const found = (row: unknown) => mockStaffFind.mockResolvedValue([row]);
const nobody = () => mockStaffFind.mockResolvedValue([]);
const mockSendMail = sendMail as unknown as Mock;

const staff = {
  id: 'staff-1',
  email: 'kovalenko@university.edu.ua',
  lastName: 'Коваленко',
  firstName: 'Іван',
  patronymic: 'Петрович',
  passwordHash: 'hashed',
  activationToken: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('requestPasswordReset', () => {
  // Reproduced on production 2026-08-28: an account stored as
  // «Skydorw@gmail.com» could not be reached by typing «sKyDorw@gmail.com».
  // The address goes to the database as typed, with `mode: 'insensitive'`
  // doing the folding — normalising the input instead would keep every row
  // already stored with a capital unreachable until a data migration had run.
  it('finds an account whatever case the address is typed in', async () => {
    found({ ...staff, email: 'Skydorw@gmail.com' });

    await requestPasswordReset({ email: 'sKyDorw@gmail.com' });

    expect(mockStaffFind.mock.calls[0][0].where).toEqual({
      email: { equals: 'skydorw@gmail.com', mode: 'insensitive' },
    });
    expect(mockSendMail).toHaveBeenCalledTimes(1);
  });

  it('rejects a malformed email', async () => {
    expect(await requestPasswordReset({ email: 'not-an-email' })).toEqual({
      error: 'Некоректний email',
    });
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('answers success for an unknown email without sending anything', async () => {
    nobody();
    expect(await requestPasswordReset({ email: 'nobody@university.edu.ua' })).toEqual({
      success: true,
    });
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('emails a reset link to an activated account', async () => {
    found(staff);
    expect(await requestPasswordReset({ email: staff.email })).toEqual({ success: true });
    expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({ to: staff.email }));
    expect(mockSendMail.mock.calls[0][0].text).toContain('/activate/raw-token');
    expect(mockSendMail.mock.calls[0][0].subject).toContain('Скидання');
  });

  // A person who never set a password did not forget one. The most ordinary way
  // to reach this action is a new colleague who cannot find their invitation.
  it('emails an INVITE letter when the account was never activated', async () => {
    found({ ...staff, passwordHash: null });
    expect(await requestPasswordReset({ email: staff.email })).toEqual({ success: true });
    expect(mockSendMail.mock.calls[0][0].text).toContain('/activate/raw-token');
    expect(mockSendMail.mock.calls[0][0].subject).not.toContain('Скидання');
  });

  it('skips sending during the cooldown but still answers success', async () => {
    found({
      ...staff,
      activationToken: { createdAt: new Date(Date.now() - 10_000) },
    });
    expect(await requestPasswordReset({ email: staff.email })).toEqual({ success: true });
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('answers success even when the mailer fails', async () => {
    found(staff);
    mockSendMail.mockRejectedValue(new Error('smtp down'));
    expect(await requestPasswordReset({ email: staff.email })).toEqual({ success: true });
  });
});
