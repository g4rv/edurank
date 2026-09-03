import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/queries/list-stake-settings', () => ({ getStakeYearSettings: vi.fn() }));
vi.mock('@/lib/db', () => ({
  db: {
    admittedStudent: { findUnique: vi.fn(), create: vi.fn() },
    studentClaim: { findMany: vi.fn() },
    speciality: { findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { Prisma } from '@/lib/generated/prisma/client';
import { getStakeYearSettings } from '@/lib/queries/list-stake-settings';
// NOT mocked: claimValue is pure, and mocking it would leave the dialog's
// figure agreeing only with itself rather than with what the bonus pays.
import { claimValue } from '@/lib/stake/claims';
import { addAdmittedStudent, claimantsFor, deleteAdmittedStudent } from './actions';

const mockAuth = auth as unknown as Mock;
const findStudent = db.admittedStudent.findUnique as unknown as Mock;
const createStudent = db.admittedStudent.create as unknown as Mock;
const findClaims = db.studentClaim.findMany as unknown as Mock;
const findSpeciality = db.speciality.findUnique as unknown as Mock;
const transaction = db.$transaction as unknown as Mock;
const settings = getStakeYearSettings as unknown as Mock;

const STUDENT = {
  id: 'st1',
  year: 2026,
  name: 'Ковальчук Олена Ігорівна',
  nameNormalised: 'ковальчук олена ігорівна',
  specialityId: 'sp1',
  degree: 'BACHELOR',
  form: 'FULL_TIME',
  funding: 'STATE',
  speciality: { name: 'Психологія', norms: [{ base: 10.5, year: 2026 }] },
};

function claim(over: Record<string, unknown> = {}) {
  return {
    id: 'cl1',
    status: 'CONFIRMED',
    degree: 'BACHELOR',
    form: 'FULL_TIME',
    funding: 'STATE',
    staff: { lastName: 'Петренко', firstName: 'Іван', patronymic: 'Миколайович' },
    ...over,
  };
}

const VALID_INPUT = {
  name: 'Ковальчук Олена Ігорівна',
  specialityId: 'sp1',
  degree: 'BACHELOR',
  form: 'FULL_TIME',
  funding: 'STATE',
  year: 2026,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN' } });
  settings.mockResolvedValue({ year: 2026, contractCoefficient: 0.175, saved: true });
  findStudent.mockResolvedValue(STUDENT);
  findSpeciality.mockResolvedValue({ name: 'Психологія' });
  createStudent.mockResolvedValue({ id: 'st-new' });
});

describe('addAdmittedStudent', () => {
  it('refuses anybody who is not ADMIN', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u2', role: 'EDITOR' } });
    await expect(addAdmittedStudent(VALID_INPUT)).resolves.toEqual({ error: 'Недостатньо прав' });
    expect(createStudent).not.toHaveBeenCalled();
  });

  it('stores the ПІБ normalised alongside the typed one', async () => {
    await expect(
      addAdmittedStudent({ ...VALID_INPUT, name: '  Ковальчук   Олена Ігорівна ' })
    ).resolves.toEqual({ success: true });

    expect(createStudent).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Ковальчук Олена Ігорівна',
          nameNormalised: 'ковальчук олена ігорівна',
          year: 2026,
        }),
      })
    );
  });

  it('gives the schema message back for bad input, not a generic one', async () => {
    await expect(addAdmittedStudent({ ...VALID_INPUT, name: 'О' })).resolves.toEqual({
      error: 'Вкажіть ПІБ',
    });
    expect(createStudent).not.toHaveBeenCalled();
  });

  it('refuses a speciality that is not in the database', async () => {
    findSpeciality.mockResolvedValue(null);
    await expect(addAdmittedStudent(VALID_INPUT)).resolves.toEqual({
      error: 'Спеціальність не знайдено',
    });
  });

  // A REAL PrismaClientKnownRequestError: isUniqueViolation tests with
  // `instanceof`, so a plain object carrying code P2002 falls through to the
  // generic message and this test would pass against a broken guard.
  it('names the duplicate rather than reporting a database failure', async () => {
    createStudent.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['year', 'nameNormalised', 'specialityId', 'form', 'funding'] },
      })
    );
    await expect(addAdmittedStudent(VALID_INPUT)).resolves.toEqual({
      error: 'Цей здобувач уже є в реєстрі на цих умовах',
    });
  });
});

describe('claimantsFor', () => {
  it('refuses anybody who is not ADMIN', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u2', role: 'EDITOR' } });
    await expect(claimantsFor('st1')).resolves.toEqual({ error: 'Недостатньо прав' });
  });

  // The whole point of the two-step dialog: it must find the claims by the SAME
  // normalised name StudentClaim was written with.
  it('finds claims by year, normalised ПІБ and speciality', async () => {
    findClaims.mockResolvedValue([]);

    await claimantsFor('st1');

    expect(findClaims).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          year: 2026,
          studentNameNormalised: 'ковальчук олена ігорівна',
          specialityId: 'sp1',
        },
      })
    );
  });

  it('says what a CONFIRMED claim costs its author, in the bonus formula’s own numbers', async () => {
    findClaims.mockResolvedValue([claim()]);

    const expected = claimValue(
      {
        staffId: '',
        status: 'CONFIRMED',
        degree: 'BACHELOR',
        form: 'FULL_TIME',
        funding: 'STATE',
        base: 10.5,
      },
      0.175
    );
    expect(expected).toBeGreaterThan(0); // guards against a silently zero fixture

    await expect(claimantsFor('st1')).resolves.toEqual({
      claimants: [{ staffName: 'Петренко Іван Миколайович', status: 'CONFIRMED', loses: expected }],
    });
  });

  it('costs a PENDING claim nothing', async () => {
    findClaims.mockResolvedValue([claim({ status: 'PENDING' })]);

    await expect(claimantsFor('st1')).resolves.toEqual({
      claimants: [{ staffName: 'Петренко Іван Миколайович', status: 'PENDING', loses: 0 }],
    });
  });

  // A speciality with no норматив for the year cannot be priced, so the claim
  // is worth nothing rather than an invented number.
  it('costs nothing when the year has no норматив for the speciality', async () => {
    findStudent.mockResolvedValue({
      ...STUDENT,
      speciality: { name: 'Психологія', norms: [{ base: 10.5, year: 2025 }] },
    });
    findClaims.mockResolvedValue([claim()]);

    const result = await claimantsFor('st1');
    expect('claimants' in result && result.claimants[0]!.loses).toBe(0);
  });

  it('returns an empty list for a student nobody claimed', async () => {
    findClaims.mockResolvedValue([]);
    await expect(claimantsFor('st1')).resolves.toEqual({ claimants: [] });
  });

  it('reports a student that is already gone', async () => {
    findStudent.mockResolvedValue(null);
    await expect(claimantsFor('st1')).resolves.toEqual({ error: 'Здобувача не знайдено' });
  });
});

describe('deleteAdmittedStudent', () => {
  it('refuses anybody who is not ADMIN', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u2', role: 'EDITOR' } });
    await expect(deleteAdmittedStudent('st1')).resolves.toEqual({ error: 'Недостатньо прав' });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('removes the student and their claims in ONE transaction', async () => {
    findClaims.mockResolvedValue([claim()]);
    const tx = {
      studentClaim: { deleteMany: vi.fn() },
      admittedStudent: { delete: vi.fn() },
      auditLog: { create: vi.fn() },
    };
    transaction.mockImplementation(async (fn: (t: unknown) => unknown) => fn(tx));

    await expect(deleteAdmittedStudent('st1')).resolves.toEqual({ success: true });

    expect(tx.studentClaim.deleteMany).toHaveBeenCalledWith({
      where: {
        year: 2026,
        studentNameNormalised: 'ковальчук олена ігорівна',
        specialityId: 'sp1',
      },
    });
    expect(tx.admittedStudent.delete).toHaveBeenCalledWith({ where: { id: 'st1' } });
  });

  // The audit line is what somebody reads back when an НПП asks where their
  // bonus went, so the claimants have to be in it.
  it('logs one entry naming every claim it took down', async () => {
    findClaims.mockResolvedValue([claim(), claim({ status: 'PENDING' })]);
    const tx = {
      studentClaim: { deleteMany: vi.fn() },
      admittedStudent: { delete: vi.fn() },
      auditLog: { create: vi.fn() },
    };
    transaction.mockImplementation(async (fn: (t: unknown) => unknown) => fn(tx));

    await deleteAdmittedStudent('st1');

    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    const logged = tx.auditLog.create.mock.calls[0]![0].data;
    expect(logged.entity).toBe('AdmittedStudent');
    expect(logged.label).toBe('Ковальчук Олена Ігорівна — Психологія (2026)');
    expect(JSON.stringify(logged.changes)).toContain('Петренко Іван (CONFIRMED)');
    expect(JSON.stringify(logged.changes)).toContain('Петренко Іван (PENDING)');
  });

  it('reports a student that is already gone', async () => {
    findStudent.mockResolvedValue(null);
    await expect(deleteAdmittedStudent('st1')).resolves.toEqual({
      error: 'Здобувача не знайдено',
    });
  });
});
