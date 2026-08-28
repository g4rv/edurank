import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/db', () => ({
  db: {
    staff: { findMany: vi.fn(), findUnique: vi.fn() },
    activationToken: { deleteMany: vi.fn() },
    auditLog: { create: vi.fn(), createMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock('@/lib/permissions', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/lib/mail/invite', async () => {
  const actual = await vi.importActual<typeof import('@/lib/mail/invite')>('@/lib/mail/invite');
  return { ...actual, issueAndEmailLink: vi.fn() };
});

import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/permissions';
import { issueAndEmailLink } from '@/lib/mail/invite';
import { inviteBatch, revertInviteSent, revertInviteSentMany } from './actions';
import { INVITE_BATCH_SIZE } from './shared';

const mockAdmin = requireAdmin as unknown as Mock;
const mockFindMany = db.staff.findMany as unknown as Mock;
const mockSend = issueAndEmailLink as unknown as Mock;
const mockFindUnique = db.staff.findUnique as unknown as Mock;
const mockTransaction = db.$transaction as unknown as Mock;
const mockTokenDelete = db.activationToken.deleteMany as unknown as Mock;
const mockAudit = db.auditLog.create as unknown as Mock;
const mockAuditMany = db.auditLog.createMany as unknown as Mock;

/** Runs the callback against the mocked tx client, like the real $transaction */
const runTransaction = () =>
  mockTransaction.mockImplementation(
    async (fn: (tx: unknown) => Promise<unknown>) =>
      await fn({
        activationToken: { deleteMany: mockTokenDelete },
        auditLog: { create: mockAudit, createMany: mockAuditMany },
      })
  );

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

// The ActivationToken row IS the record that a letter went out — there is no
// `invitedAt` column — so putting somebody back into «не надсилалося» means
// deleting it. Which also kills the link in their mailbox, and erases the only
// trace of that send.
describe('revertInviteSent', () => {
  const pending = {
    lastName: 'Франко',
    firstName: 'Іван',
    patronymic: 'Якович',
    passwordHash: null,
    activationToken: { createdAt: new Date('2026-08-25T09:00:00.000Z') },
  };

  it('refuses anybody who is not ADMIN', async () => {
    mockAdmin.mockResolvedValue(null);
    expect(await revertInviteSent('s1')).toEqual({ error: 'Недостатньо прав' });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('refuses a record that does not exist', async () => {
    mockFindUnique.mockResolvedValue(null);
    expect(await revertInviteSent('s1')).toEqual({ error: 'Запис не знайдено' });
  });

  // The token is irrelevant once a password exists, and silently succeeding
  // would leave the list unchanged with no explanation.
  it('refuses somebody who has already activated', async () => {
    mockFindUnique.mockResolvedValue({ ...pending, passwordHash: '$2b$10$x' });
    expect(await revertInviteSent('s1')).toEqual({ error: 'Обліковий запис вже активовано' });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('refuses somebody no letter ever went to', async () => {
    mockFindUnique.mockResolvedValue({ ...pending, activationToken: null });
    expect(await revertInviteSent('s1')).toEqual({
      error: 'Запрошення цій людині не надсилалося',
    });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('deletes the token, which is what puts them back in the batch', async () => {
    mockFindUnique.mockResolvedValue(pending);
    runTransaction();

    expect(await revertInviteSent('s1')).toEqual({ success: true });
    expect(mockTokenDelete).toHaveBeenCalledWith({ where: { staffId: 's1' } });
  });

  // Invites write no audit entry anywhere else — the token row is the trace.
  // This action destroys that row, so without an entry «to whom did we write,
  // and when» stops being answerable.
  it('records the send it just erased', async () => {
    mockFindUnique.mockResolvedValue(pending);
    runTransaction();

    await revertInviteSent('s1');

    expect(mockAudit).toHaveBeenCalledTimes(1);
    const entry = mockAudit.mock.calls[0][0].data;
    expect(entry).toMatchObject({ entity: 'Staff', entityId: 's1', userId: 'a1' });
    expect(entry.label).toBe('Франко Іван Якович');
    expect(entry.changes).toEqual({
      invitedAt: { from: '2026-08-25T09:00:00.000Z', to: null },
    });
  });
});

// The bulk version acts on whatever the page's filters currently select — the
// list is already narrowed by кафедра, kind and domain before it reaches the
// button, so «скинути» never reaches wider than what is on screen.
describe('revertInviteSentMany', () => {
  const invited = (id: string) => ({
    id,
    lastName: 'Франко',
    firstName: 'Іван',
    patronymic: 'Якович',
    activationToken: { createdAt: new Date('2026-08-25T09:00:00.000Z') },
  });

  it('refuses anybody who is not ADMIN', async () => {
    mockAdmin.mockResolvedValue(null);
    expect(await revertInviteSentMany(['s1'])).toEqual({ error: 'Недостатньо прав' });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('refuses an empty selection', async () => {
    expect(await revertInviteSentMany([])).toEqual({ error: 'Нікого не вибрано' });
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  // The narrowing that matters: only people still on the roster, still without
  // a password, and who actually hold a token.
  it('asks only for people a reset can apply to', async () => {
    mockFindMany.mockResolvedValue([invited('s1')]);
    runTransaction();

    await revertInviteSentMany(['s1', 's2']);

    expect(mockFindMany.mock.calls[0][0].where).toMatchObject({
      id: { in: ['s1', 's2'] },
      passwordHash: null,
      activationToken: { isNot: null },
    });
  });

  it('clears every token in one query and reports the count', async () => {
    mockFindMany.mockResolvedValue([invited('s1'), invited('s2'), invited('s3')]);
    runTransaction();

    expect(await revertInviteSentMany(['s1', 's2', 's3'])).toEqual({ success: true, count: 3 });
    expect(mockTokenDelete).toHaveBeenCalledTimes(1);
    expect(mockTokenDelete).toHaveBeenCalledWith({
      where: { staffId: { in: ['s1', 's2', 's3'] } },
    });
  });

  // Per person, not one summary row: «did we write to Франко, and when» is the
  // question this has to answer later, and a count cannot answer it.
  it('records one audit entry per person', async () => {
    mockFindMany.mockResolvedValue([invited('s1'), invited('s2')]);
    runTransaction();

    await revertInviteSentMany(['s1', 's2']);

    const rows = mockAuditMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(2);
    expect(rows.map((r: { entityId: string }) => r.entityId)).toEqual(['s1', 's2']);
    expect(rows[0].changes).toEqual({
      invitedAt: { from: '2026-08-25T09:00:00.000Z', to: null },
    });
  });

  // Everybody in the selection activated between the page render and the click.
  it('says so rather than reporting a reset of nobody', async () => {
    mockFindMany.mockResolvedValue([]);
    expect(await revertInviteSentMany(['s1'])).toEqual({ error: 'Немає кому скидати статус' });
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});
