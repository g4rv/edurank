import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@/lib/activation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/activation')>();
  return {
    ...actual,
    storeActivationToken: vi.fn().mockResolvedValue(undefined),
  };
});
vi.mock('@/lib/mail/mailer', () => ({ sendMail: vi.fn().mockResolvedValue(undefined) }));

import { storeActivationToken } from '@/lib/activation';
import { sendMail } from '@/lib/mail/mailer';
import { issueAndEmailLink, staffFullName } from './invite';

const mockStore = storeActivationToken as unknown as Mock;
const mockSendMail = sendMail as unknown as Mock;

const staff = {
  id: 'staff-1',
  email: 'perchuk@uhsp.edu.ua',
  lastName: 'Перчук',
  firstName: 'Оксана',
  patronymic: 'Іванівна',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockSendMail.mockResolvedValue(undefined);
});

describe('issueAndEmailLink', () => {
  it('mails a link carrying the token it is about to store', async () => {
    await issueAndEmailLink(staff, 'invite');

    const [message] = mockSendMail.mock.calls[0];
    const token = message.text.match(/\/activate\/([0-9a-f]{64})/)?.[1];
    expect(token).toBeTruthy();
    expect(message.to).toBe(staff.email);

    // The row must hold the HASH of exactly the token that was mailed —
    // `findStaffByActivationToken` hashes the link and looks it up.
    const { createHash } = await import('crypto');
    const [staffId, minted] = mockStore.mock.calls[0];
    expect(staffId).toBe('staff-1');
    expect(minted.tokenHash).toBe(createHash('sha256').update(token!).digest('hex'));
  });

  /**
   * The whole point of the split. The token row is the app's only record that a
   * letter went out — /admin/invites reads it as «Останнє запрошення» and a
   * bulk send filters on it — so a refused message that still left a row marked
   * the person as written to, and «не надсилалося» skipped them for good.
   */
  it('stores nothing when the mail is refused', async () => {
    mockSendMail.mockRejectedValue(new Error('550 mailbox unavailable'));

    await expect(issueAndEmailLink(staff, 'invite')).rejects.toThrow();
    expect(mockStore).not.toHaveBeenCalled();
  });

  // A failed send used to run the upsert first, so a person holding a working
  // link lost it in exchange for one that was never delivered.
  it('leaves an existing link alone when the mail is refused', async () => {
    mockSendMail.mockRejectedValue(new Error('rate limited'));

    await expect(issueAndEmailLink(staff, 'reset')).rejects.toThrow();
    expect(mockStore).not.toHaveBeenCalled();
  });

  it('sends the reset wording, not the invitation, for a reset', async () => {
    await issueAndEmailLink(staff, 'reset');
    const [invite] = mockSendMail.mock.calls[0];
    mockSendMail.mockClear();
    await issueAndEmailLink(staff, 'invite');
    const [welcome] = mockSendMail.mock.calls[0];

    expect(invite.subject).not.toBe(welcome.subject);
  });
});

describe('staffFullName', () => {
  it('is ПІБ in the order the university writes it', () => {
    expect(staffFullName(staff)).toBe('Перчук Оксана Іванівна');
  });
});
