import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: { staff: { findUnique: vi.fn() } },
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

const mockStaffFind = db.staff.findUnique as unknown as Mock;
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
  it('rejects a malformed email', async () => {
    expect(await requestPasswordReset({ email: 'not-an-email' })).toEqual({
      error: 'Некоректний email',
    });
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('answers success for an unknown email without sending anything', async () => {
    mockStaffFind.mockResolvedValue(null);
    expect(await requestPasswordReset({ email: 'nobody@university.edu.ua' })).toEqual({
      success: true,
    });
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('emails a reset link to an activated account', async () => {
    mockStaffFind.mockResolvedValue(staff);
    expect(await requestPasswordReset({ email: staff.email })).toEqual({ success: true });
    expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({ to: staff.email }));
    expect(mockSendMail.mock.calls[0][0].text).toContain('/activate/raw-token');
    expect(mockSendMail.mock.calls[0][0].subject).toContain('Скидання');
  });

  // A person who never set a password did not forget one. The most ordinary way
  // to reach this action is a new colleague who cannot find their invitation.
  it('emails an INVITE letter when the account was never activated', async () => {
    mockStaffFind.mockResolvedValue({ ...staff, passwordHash: null });
    expect(await requestPasswordReset({ email: staff.email })).toEqual({ success: true });
    expect(mockSendMail.mock.calls[0][0].text).toContain('/activate/raw-token');
    expect(mockSendMail.mock.calls[0][0].subject).not.toContain('Скидання');
  });

  it('skips sending during the cooldown but still answers success', async () => {
    mockStaffFind.mockResolvedValue({
      ...staff,
      activationToken: { createdAt: new Date(Date.now() - 10_000) },
    });
    expect(await requestPasswordReset({ email: staff.email })).toEqual({ success: true });
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('answers success even when the mailer fails', async () => {
    mockStaffFind.mockResolvedValue(staff);
    mockSendMail.mockRejectedValue(new Error('smtp down'));
    expect(await requestPasswordReset({ email: staff.email })).toEqual({ success: true });
  });
});
