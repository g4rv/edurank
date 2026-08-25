import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({
  db: {
    studentClaim: { findUnique: vi.fn(), update: vi.fn() },
    staff: { findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { decideStudentClaim } from './actions';

const mockAuth = auth as unknown as Mock;
const mockClaim = db.studentClaim.findUnique as unknown as Mock;
const mockUpdate = db.studentClaim.update as unknown as Mock;
const mockStaff = db.staff.findUnique as unknown as Mock;

/** The claim under review: filed by `npp-1`, who sits on кафедра `dep-1` */
function claimExists() {
  mockClaim.mockResolvedValue({
    staffId: 'npp-1',
    status: 'PENDING',
    studentName: 'Базильчук Галина Ігорівна',
    staff: { lastName: 'Ліщенко', firstName: 'Марта' },
  });
  mockStaff.mockResolvedValue({ departmentId: 'dep-1' });
}

function form(decision: 'CONFIRMED' | 'REJECTED', reason?: string) {
  const data = new FormData();
  data.set('claimId', 'claim-1');
  data.set('decision', decision);
  if (reason !== undefined) data.set('reason', reason);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  claimExists();
  mockUpdate.mockResolvedValue({});
});

// Who may rule on a recruited-student claim: **ADMIN and nobody else** (owner,
// 2026-08-25), retracting «admin/head can approve (dean can only inspect)» of
// 2026-08-17. A confirmed claim pays a bonus out of a fund the завідувач then
// spends, so the head no longer confirms it either. Headship is not a Role and
// used to be read from `headOf`; that call is gone entirely, which is what the
// «no matter what they head» cases below pin down.
describe('decideStudentClaim authorization', () => {
  it('lets ADMIN decide', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'a1', role: 'ADMIN', staffId: 'a1' } });

    expect(await decideStudentClaim(null, form('CONFIRMED'))).toEqual({ success: true });
    expect(mockUpdate).toHaveBeenCalled();
  });

  // The change of 2026-08-25. This head runs the claimant's own кафедра, which
  // is exactly what used to grant the decision.
  it('refuses the завідувач of the claimant’s кафедра', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'h1', role: 'USER', staffId: 'h1' } });

    expect(await decideStudentClaim(null, form('CONFIRMED'))).toEqual({
      error: 'Недостатньо прав',
    });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('refuses a декан, who oversees the кафедра but does not head it', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'd1', role: 'USER', staffId: 'd1' } });

    expect(await decideStudentClaim(null, form('CONFIRMED'))).toEqual({
      error: 'Недостатньо прав',
    });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('refuses an EDITOR — reading any rating is not deciding a ставка', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'e1', role: 'EDITOR', staffId: 'e1' } });

    expect(await decideStudentClaim(null, form('CONFIRMED'))).toEqual({
      error: 'Недостатньо прав',
    });
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe('decideStudentClaim rejection', () => {
  it('stores the reason, which the НПП sees', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'a1', role: 'ADMIN', staffId: 'a1' } });

    expect(await decideStudentClaim(null, form('REJECTED', 'Цього вступника залучив інший НПП')));

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'REJECTED',
          rejectReason: 'Цього вступника залучив інший НПП',
        }),
      })
    );
  });

  it('refuses a rejection with no reason', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'a1', role: 'ADMIN', staffId: 'a1' } });

    const result = await decideStudentClaim(null, form('REJECTED', ''));
    expect(result).toHaveProperty('error');
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  // Confirming clears any earlier reason, so a re-confirmed claim does not keep
  // showing the НПП why it was once refused.
  it('clears the reason when confirming', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'a1', role: 'ADMIN', staffId: 'a1' } });

    await decideStudentClaim(null, form('CONFIRMED'));

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'CONFIRMED', rejectReason: null }),
      })
    );
  });
});
