import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: { staff: { findMany: vi.fn() } } }));
vi.mock('@/lib/permissions', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/lib/mail/invite', async () => {
  const actual = await vi.importActual<typeof import('@/lib/mail/invite')>('@/lib/mail/invite');
  return { ...actual, issueAndEmailLink: vi.fn() };
});

import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/permissions';
import { issueAndEmailLink } from '@/lib/mail/invite';
import { inviteBatch } from './actions';
import { INVITE_BATCH_SIZE } from './shared';

const mockAdmin = requireAdmin as unknown as Mock;
const mockFindMany = db.staff.findMany as unknown as Mock;
const mockSend = issueAndEmailLink as unknown as Mock;

function person(id: string, over: Partial<{ passwordHash: string | null }> = {}) {
  return {
    id,
    email: `${id}@univ.ua`,
    lastName: 'Франко',
    firstName: 'Іван',
    patronymic: 'Якович',
    passwordHash: null,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // No pause between messages, or every test waits for the real throttle
  process.env.INVITE_DELAY_MS = '0';
  mockAdmin.mockResolvedValue({ user: { id: 'a1', role: 'ADMIN' } });
});

describe('inviteBatch authorization', () => {
  it('rejects a non-admin', async () => {
    mockAdmin.mockResolvedValue(null);
    expect(await inviteBatch(['s1'])).toEqual({ error: 'Недостатньо прав' });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('refuses more than one batch at a time', async () => {
    const ids = Array.from({ length: INVITE_BATCH_SIZE + 1 }, (_, i) => `s${i}`);
    expect(await inviteBatch(ids)).toEqual({ error: 'Забагато адресатів за один раз' });
    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe('inviteBatch without an address', () => {
  it('refuses a placeholder and says what to do, without sending', async () => {
    const p = person('s1');
    p.email = 'hbur.zoriana@no-email.invalid';
    mockFindMany.mockResolvedValue([p]);

    const state = await inviteBatch(['s1']);

    expect(mockSend).not.toHaveBeenCalled();
    expect(state).toEqual({
      results: [
        {
          id: 's1',
          fullName: 'Франко Іван Якович',
          email: 'hbur.zoriana@no-email.invalid',
          ok: false,
          error: 'Немає адреси — вкажіть її на сторінці працівника',
        },
      ],
    });
  });

  it('does not stop the rest of the batch', async () => {
    const without = person('s1');
    without.email = 'x@no-email.invalid';
    mockFindMany.mockResolvedValue([without, person('s2')]);
    mockSend.mockResolvedValue(undefined);

    const state = await inviteBatch(['s1', 's2']);

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect('results' in state && state.results.map((r) => r.ok)).toEqual([false, true]);
  });
});

describe('inviteBatch sending', () => {
  it('mails everyone who has no account', async () => {
    mockFindMany.mockResolvedValue([person('s1'), person('s2')]);
    mockSend.mockResolvedValue(undefined);

    const result = await inviteBatch(['s1', 's2']);
    expect('results' in result && result.results.every((r) => r.ok)).toBe(true);
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  // The list may have been rendered minutes ago; anything can have changed.
  it('skips someone who has already activated', async () => {
    mockFindMany.mockResolvedValue([person('s1', { passwordHash: 'hash' })]);

    const result = await inviteBatch(['s1']);
    expect(result).toEqual({
      results: [
        {
          id: 's1',
          fullName: 'Франко Іван Якович',
          email: 's1@univ.ua',
          ok: false,
          error: 'Обліковий запис вже активовано',
        },
      ],
    });
    expect(mockSend).not.toHaveBeenCalled();
  });

  // Archived people are filtered out by ON_ROSTER, so they come back missing.
  it('reports an id the query did not return', async () => {
    mockFindMany.mockResolvedValue([]);

    const result = await inviteBatch(['gone']);
    expect('results' in result && result.results[0]).toMatchObject({
      id: 'gone',
      ok: false,
      error: 'Запис не знайдено',
    });
  });

  // The point of the whole batch design: one bad address must not cost the
  // other nineteen people their invite.
  it('keeps going after a failure and reports it per person', async () => {
    mockFindMany.mockResolvedValue([person('s1'), person('s2'), person('s3')]);
    mockSend
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('mailbox full'))
      .mockResolvedValueOnce(undefined);

    const result = await inviteBatch(['s1', 's2', 's3']);
    expect('results' in result).toBe(true);
    if (!('results' in result)) return;

    expect(result.results.map((r) => r.ok)).toEqual([true, false, true]);
    expect(result.results[1].error).toBe('Лист не надіслано');
    expect(mockSend).toHaveBeenCalledTimes(3);
  });

  it('preserves the order it was asked for', async () => {
    // Prisma returns rows in its own order; the report must follow the input.
    mockFindMany.mockResolvedValue([person('s3'), person('s1'), person('s2')]);
    mockSend.mockResolvedValue(undefined);

    const result = await inviteBatch(['s1', 's2', 's3']);
    expect('results' in result && result.results.map((r) => r.id)).toEqual(['s1', 's2', 's3']);
  });

  it('does nothing for an empty list', async () => {
    expect(await inviteBatch([])).toEqual({ results: [] });
    expect(mockFindMany).not.toHaveBeenCalled();
  });
});
