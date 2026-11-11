import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('redirected');
  }),
}));
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
// The freeze is a switch read from the database (lib/freeze): off here, its
// rules have their own tests (lib/freeze/rules.test.ts).
vi.mock('@/lib/freeze/state', () => ({
  freezeFor: vi
    .fn()
    .mockResolvedValue({ kharakterystyka: false, linkedRating: false, profile: false }),
  loadFreezeSettings: vi.fn(),
  isFreezeExempt: vi.fn().mockResolvedValue(false),
  FREEZE_SETTINGS_ID: 'default',
}));
vi.mock('@/lib/rating/reused-doi', () => ({ doiClash: vi.fn().mockResolvedValue(null) }));
vi.mock('@/validations/activity-type-spec', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/validations/activity-type-spec')>()),
  parseTypeSpecs: vi.fn(() => ({ fields: [] })),
}));
vi.mock('@/lib/db', () => ({
  db: {
    staff: { findUnique: vi.fn() },
    activity: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  checkRestoreActivity,
  removeActivity,
  restoreActivity,
  setActivityVerified,
} from './actions';
import { doiClash } from '@/lib/rating/reused-doi';

const mockAuth = auth as unknown as Mock;
const mockStaffFind = db.staff.findUnique as unknown as Mock;
const mockActivityFind = db.activity.findUnique as unknown as Mock;
const mockTransaction = db.$transaction as unknown as Mock;

const adminSession = { user: { id: 'admin-1', role: 'ADMIN', staffId: null } };
const nnvEditorSession = { user: { id: 'editor-1', role: 'EDITOR', staffId: 'staff-nnv' } };

// APPROVED NPP self-report in an OPEN year — the discardable case
const approvedActivity = {
  id: 'activity-1',
  staffId: 'staff-1',
  year: 2026,
  score: 10,
  status: 'APPROVED',
  submittedByRole: 'NPP',
  activityType: { label: 'Конференції в Україні', template: { status: 'OPEN' } },
};

function mockTx() {
  const tx = {
    activity: {
      update: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    // No gating indicator in the year — the rating is open (rating-gate.ts)
    activityType: { findMany: vi.fn().mockResolvedValue([]) },
    ratingEntry: { upsert: vi.fn().mockResolvedValue({}) },
  };
  mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx));
  return tx;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue(adminSession);
  mockActivityFind.mockResolvedValue(approvedActivity);
});

describe('removeActivity', () => {
  it('rejects USER role', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u', role: 'USER', staffId: 'staff-1' } });
    expect(await removeActivity('activity-1', 'причина')).toEqual({
      error: 'Недостатньо прав',
    });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('rejects an editor whose division lacks the moderation flag', async () => {
    mockAuth.mockResolvedValue(nnvEditorSession);
    mockStaffFind.mockResolvedValue({ division: { canModerateRating: false } });
    expect(await removeActivity('activity-1', 'причина')).toEqual({
      error: 'Недостатньо прав',
    });
  });

  it('allows an editor whose division carries the moderation flag', async () => {
    mockAuth.mockResolvedValue(nnvEditorSession);
    mockStaffFind.mockResolvedValue({ division: { canModerateRating: true } });
    const tx = mockTx();
    expect(await removeActivity('activity-1', 'причина')).toEqual({ success: true });
    expect(tx.activity.update).toHaveBeenCalled();
  });

  it('requires a non-empty reason', async () => {
    expect(await removeActivity('activity-1', '   ')).toEqual({
      error: 'Вкажіть причину відхилення',
    });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('rejects an already removed entry', async () => {
    mockActivityFind.mockResolvedValue({ ...approvedActivity, status: 'REMOVED' });
    expect(await removeActivity('activity-1', 'причина')).toEqual({
      error: 'Це досягнення не можна відхилити',
    });
  });

  it('rejects a division-entered value', async () => {
    mockActivityFind.mockResolvedValue({ ...approvedActivity, submittedByRole: 'DIVISION' });
    expect(await removeActivity('activity-1', 'причина')).toEqual({
      error: 'Це досягнення не можна відхилити',
    });
  });

  it('rejects when the year is closed', async () => {
    mockActivityFind.mockResolvedValue({
      ...approvedActivity,
      activityType: { ...approvedActivity.activityType, template: { status: 'CLOSED' } },
    });
    expect(await removeActivity('activity-1', 'причина')).toEqual({
      error: 'Рейтинговий рік закрито',
    });
  });

  it('discards as admin: sets REMOVED with reason, audits, recomputes', async () => {
    const tx = mockTx();
    expect(await removeActivity('activity-1', '  публікацію не знайдено  ')).toEqual({
      success: true,
    });
    expect(tx.activity.update).toHaveBeenCalledWith({
      where: { id: 'activity-1' },
      data: expect.objectContaining({
        status: 'REMOVED',
        removedByUserId: 'admin-1',
        removeReason: 'публікацію не знайдено',
      }),
    });
    expect(tx.auditLog.create).toHaveBeenCalled();
    expect(tx.ratingEntry.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { staffId_year: { staffId: 'staff-1', year: 2026 } },
      })
    );
  });
});

describe('setActivityVerified', () => {
  const publication = {
    id: 'activity-2',
    status: 'APPROVED',
    verifiedAt: null,
    staff: { lastName: 'Коваленко', firstName: 'Іван', patronymic: 'Петрович' },
    activityType: {
      requiresVerification: true,
      label: 'Публікації категорії «Б»',
      template: { status: 'OPEN' },
    },
  };

  function mockVerifyTx() {
    const tx = {
      activity: { update: vi.fn().mockResolvedValue({}) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx));
    return tx;
  }

  it('rejects an editor whose division lacks the moderation flag', async () => {
    mockAuth.mockResolvedValue(nnvEditorSession);
    mockStaffFind.mockResolvedValue({ division: { canModerateRating: false } });
    mockActivityFind.mockResolvedValue(publication);
    expect(await setActivityVerified('activity-2', true)).toEqual({
      error: 'Недостатньо прав',
    });
  });

  // Which indicators are checkable is a column on the row now, so an admin can
  // mark a newly built publication indicator verifiable without a code change.
  // The whole point of the column: a publication indicator an admin builds in
  // the template editor carries no known code, and must still be checkable.
  it('accepts an indicator with an unknown code once it is marked verifiable', async () => {
    mockActivityFind.mockResolvedValue({
      ...publication,
      activityType: {
        requiresVerification: true,
        label: 'Публікації у нових виданнях (2027)',
        template: { status: 'OPEN' },
      },
    });
    const tx = mockVerifyTx();

    expect(await setActivityVerified('activity-2', true)).toEqual({
      success: true,
      verified: true,
    });
    expect(tx.activity.update).toHaveBeenCalled();
  });

  it('rejects an indicator that is not marked as needing verification', async () => {
    mockActivityFind.mockResolvedValue({
      ...publication,
      activityType: { ...publication.activityType, requiresVerification: false },
    });
    expect(await setActivityVerified('activity-2', true)).toEqual({
      error: 'Цей показник не потребує перевірки',
    });
  });

  it('rejects when the year is closed', async () => {
    mockActivityFind.mockResolvedValue({
      ...publication,
      activityType: { ...publication.activityType, template: { status: 'CLOSED' } },
    });
    expect(await setActivityVerified('activity-2', true)).toEqual({
      error: 'Рейтинговий рік закрито',
    });
  });

  it('marks verified with the checker recorded, audits', async () => {
    mockActivityFind.mockResolvedValue(publication);
    const tx = mockVerifyTx();
    expect(await setActivityVerified('activity-2', true)).toEqual({
      success: true,
      verified: true,
    });
    expect(tx.activity.update).toHaveBeenCalledWith({
      where: { id: 'activity-2' },
      data: { verifiedAt: expect.any(Date), verifiedByUserId: 'admin-1' },
    });
    expect(tx.auditLog.create).toHaveBeenCalled();
  });

  it('clears the mark', async () => {
    mockActivityFind.mockResolvedValue({ ...publication, verifiedAt: new Date() });
    const tx = mockVerifyTx();
    expect(await setActivityVerified('activity-2', false)).toEqual({
      success: true,
      verified: false,
    });
    expect(tx.activity.update).toHaveBeenCalledWith({
      where: { id: 'activity-2' },
      data: { verifiedAt: null, verifiedByUserId: null },
    });
  });

  it('no-ops when the state already matches', async () => {
    mockActivityFind.mockResolvedValue(publication);
    expect(await setActivityVerified('activity-2', false)).toEqual({
      success: true,
      verified: false,
    });
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});

describe('restoreActivity', () => {
  const removedActivity = {
    ...approvedActivity,
    status: 'REMOVED',
    removeReason: 'Вказано невірне DOI',
    evidence: { doi: '10.1/x' },
    activityType: {
      label: 'Публікації «Б»',
      code: 'publication_cat_b',
      evidenceFields: [],
      scoring: { kind: 'fixed', points: 300 },
      template: { status: 'OPEN' },
    },
  };

  beforeEach(() => {
    mockActivityFind.mockResolvedValue(removedActivity);
    (doiClash as unknown as Mock).mockResolvedValue(null);
  });

  it('is ADMIN only — a moderator editor is refused', async () => {
    mockAuth.mockResolvedValue(nnvEditorSession);
    mockStaffFind.mockResolvedValue({ division: { canModerateRating: true } });
    expect(await restoreActivity('activity-1')).toEqual({ error: 'Недостатньо прав' });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('refuses an entry that is not discarded', async () => {
    mockActivityFind.mockResolvedValue({ ...removedActivity, status: 'APPROVED' });
    expect(await restoreActivity('activity-1')).toEqual({
      error: 'Це досягнення не можна повернути',
    });
  });

  it('refuses when the year is closed', async () => {
    mockActivityFind.mockResolvedValue({
      ...removedActivity,
      activityType: { ...removedActivity.activityType, template: { status: 'CLOSED' } },
    });
    expect(await restoreActivity('activity-1')).toEqual({ error: 'Рейтинговий рік закрито' });
  });

  it('refuses when the person already holds the same DOI in another entry', async () => {
    (doiClash as unknown as Mock).mockResolvedValue({ itemNumber: '3.9', year: 2026 });
    const result = await restoreActivity('activity-1');
    expect(result).toMatchObject({ error: expect.stringContaining('вже зайнято в показнику') });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('restores as admin: APPROVED, reason cleared, audited, recomputed', async () => {
    const tx = mockTx();
    expect(await restoreActivity('activity-1')).toEqual({ success: true });
    expect(tx.activity.update).toHaveBeenCalledWith({
      where: { id: 'activity-1' },
      data: { status: 'APPROVED', removedByUserId: null, removedAt: null, removeReason: null },
    });
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    expect(tx.ratingEntry.upsert).toHaveBeenCalled();
  });
});

describe('checkRestoreActivity', () => {
  const removed = {
    ...approvedActivity,
    status: 'REMOVED',
    removeReason: 'причина',
    evidence: {},
    activityType: {
      label: 'Публікації «Б»',
      code: 'publication_cat_b',
      evidenceFields: [],
      scoring: {},
      template: { status: 'OPEN' },
    },
  };

  beforeEach(() => {
    mockActivityFind.mockResolvedValue(removed);
    (doiClash as unknown as Mock).mockResolvedValue(null);
  });

  it('says ok when nothing stands in the way, and writes nothing', async () => {
    expect(await checkRestoreActivity('activity-1')).toEqual({ ok: true });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('returns the DOI message so the dialog can show it', async () => {
    (doiClash as unknown as Mock).mockResolvedValue({ itemNumber: '3.9', year: 2026 });
    const result = await checkRestoreActivity('activity-1');
    expect(result).toMatchObject({
      error: expect.stringContaining('вже зайнято в показнику п. 3.9'),
    });
  });

  it('is ADMIN only', async () => {
    mockAuth.mockResolvedValue(nnvEditorSession);
    expect(await checkRestoreActivity('activity-1')).toEqual({ error: 'Недостатньо прав' });
  });
});
