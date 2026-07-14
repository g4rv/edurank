import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: { staff: { findUnique: vi.fn() } },
}));
vi.mock('@/lib/activation', () => ({
  ACTIVATION_TOKEN_DAYS: 30,
  issueActivationToken: vi.fn().mockResolvedValue('raw-token'),
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

  it('emails a reset link to an existing account', async () => {
    mockStaffFind.mockResolvedValue(staff);
    expect(await requestPasswordReset({ email: staff.email })).toEqual({ success: true });
    expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({ to: staff.email }));
    expect(mockSendMail.mock.calls[0][0].text).toContain('/activate/raw-token');
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
