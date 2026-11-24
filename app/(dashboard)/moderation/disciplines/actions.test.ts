import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('redirected');
  }),
}));
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({
  db: {
    staff: { findUnique: vi.fn() },
    activity: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { catalogueType } from '@/lib/rating/db-specs';
import { countEntryForDiscipline } from './actions';

const mockAuth = auth as unknown as Mock;
const mockStaffFind = db.staff.findUnique as unknown as Mock;
const mockActivityFind = db.activity.findUnique as unknown as Mock;
const mockTransaction = db.$transaction as unknown as Mock;

const admin = { user: { id: 'admin-1', role: 'ADMIN', staffId: null } };
const nnv = { user: { id: 'editor-1', role: 'EDITOR', staffId: 'staff-nnv' } };

const moodle = catalogueType('moodle_course').specs;
const typo = { isLecturer: true, discipline: 'Вступ до спеціальності (фвху)', link: 'https://m/1' };

const entry = {
  id: 'act-1',
  staffId: 'staff-1',
  year: 2026,
  status: 'APPROVED',
  evidence: typo,
  activityTypeId: 'type-51',
  activityType: {
    label: '5.1',
    gatesRating: true,
    evidenceFields: moodle.evidenceFields,
    template: { status: 'OPEN' },
  },
  staff: { lastName: 'Каменська', firstName: 'Ірина', patronymic: 'Іванівна' },
};

function mockTx(opts: { assigned?: unknown[]; others?: unknown[]; fresh?: unknown } = {}) {
  const tx = {
    assignedDiscipline: {
      findMany: vi.fn().mockResolvedValue(
        opts.assigned ?? [
          {
            name: 'Вступ до спеціальності (фаху)',
            nameNormalised: 'вступ до спеціальності (фаху)',
          },
        ]
      ),
    },
    activity: {
      findMany: vi.fn().mockResolvedValue(opts.others ?? []),
      findUnique: vi.fn().mockResolvedValue(opts.fresh ?? { evidence: typo, status: 'APPROVED' }),
      update: vi.fn().mockResolvedValue({}),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  };
  mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx));
  return tx;
}

const input = { activityId: 'act-1', discipline: 'Вступ до спеціальності (фаху)' };

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue(admin);
  mockActivityFind.mockResolvedValue(entry);
});

describe('countEntryForDiscipline', () => {
  it('gives the entry the assigned name, changes nothing else and audits the old name', async () => {
    const tx = mockTx();
    expect(await countEntryForDiscipline(input)).toEqual({ success: true });
    expect(tx.activity.update).toHaveBeenCalledWith({
      where: { id: 'act-1' },
      data: { evidence: { ...typo, discipline: 'Вступ до спеціальності (фаху)' } },
    });
    expect(tx.auditLog.create.mock.calls[0][0].data).toMatchObject({
      action: 'UPDATE',
      entity: 'Activity',
      entityId: 'act-1',
      userId: 'admin-1',
      changes: {
        discipline: {
          from: 'Вступ до спеціальності (фвху)',
          to: 'Вступ до спеціальності (фаху)',
        },
      },
    });
    expect(revalidatePath).toHaveBeenCalledWith('/moderation/disciplines');
  });

  it('is open to a ННВ editor and closed to anybody else', async () => {
    mockAuth.mockResolvedValue(nnv);
    mockStaffFind.mockResolvedValue({ division: { canModerateRating: true } });
    mockTx();
    expect(await countEntryForDiscipline(input)).toEqual({ success: true });

    mockStaffFind.mockResolvedValue({ division: { canModerateRating: false } });
    const tx = mockTx();
    expect(await countEntryForDiscipline(input)).toEqual({ error: 'Недостатньо прав' });
    expect(tx.activity.update).not.toHaveBeenCalled();

    mockAuth.mockResolvedValue({ user: { id: 'u', role: 'USER', staffId: 'staff-9' } });
    expect(await countEntryForDiscipline(input)).toEqual({ error: 'Недостатньо прав' });
  });

  it('refuses in a closed year', async () => {
    mockActivityFind.mockResolvedValue({
      ...entry,
      activityType: { ...entry.activityType, template: { status: 'CLOSED' } },
    });
    const tx = mockTx();
    expect(await countEntryForDiscipline(input)).toEqual({ error: 'Рейтинговий рік закрито' });
    expect(tx.activity.update).not.toHaveBeenCalled();
  });

  it('refuses an entry of an indicator that asks for no discipline', async () => {
    mockActivityFind.mockResolvedValue({
      ...entry,
      activityType: { ...entry.activityType, gatesRating: false },
    });
    expect(await countEntryForDiscipline(input)).toEqual({
      error: 'Цей запис не належить до пункту з дисциплінами',
    });
  });

  it('refuses a discipline that already has an entry', async () => {
    const tx = mockTx({
      others: [{ evidence: { discipline: 'Вступ до спеціальності (фаху)', isLecturer: false } }],
    });
    expect(await countEntryForDiscipline(input)).toEqual({
      error: 'Для цієї дисципліни запис уже є',
    });
    expect(tx.activity.update).not.toHaveBeenCalled();
  });

  it('refuses to take an entry away from the discipline it already counts for', async () => {
    const tx = mockTx({
      assigned: [
        { name: 'Психологія', nameNormalised: 'психологія' },
        { name: 'Вступ до спеціальності (фаху)', nameNormalised: 'вступ до спеціальності (фаху)' },
      ],
      fresh: { evidence: { discipline: 'Психологія' }, status: 'APPROVED' },
    });
    expect(await countEntryForDiscipline(input)).toEqual({
      error: 'Цей запис уже зараховано за іншою дисципліною зі списку',
    });
    expect(tx.activity.update).not.toHaveBeenCalled();
  });

  it('refuses a discipline that is not on the person’s list', async () => {
    const tx = mockTx();
    expect(await countEntryForDiscipline({ ...input, discipline: 'Астрономія' })).toEqual({
      error: 'Такої дисципліни немає у списку цієї людини',
    });
    expect(tx.activity.update).not.toHaveBeenCalled();
  });

  it('refuses an entry discarded since the page was drawn', async () => {
    const tx = mockTx({ fresh: { evidence: typo, status: 'REMOVED' } });
    expect(await countEntryForDiscipline(input)).toEqual({
      error: 'Цей запис не зараховується',
    });
    expect(tx.activity.update).not.toHaveBeenCalled();
  });
});
