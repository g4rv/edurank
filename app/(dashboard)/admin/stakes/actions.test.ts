import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/permissions', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/lib/db', () => ({
  db: {
    department: { findUnique: vi.fn() },
    speciality: { findUnique: vi.fn() },
    staff: { count: vi.fn() },
    departmentStake: { findUnique: vi.fn(), upsert: vi.fn() },
    specialityNorm: { findUnique: vi.fn(), upsert: vi.fn() },
    stakeYearSettings: { findUnique: vi.fn(), upsert: vi.fn() },
    ratingTemplate: { findFirst: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/permissions';
import { setDepartmentStake, setSpecialityNorm, setStakeYearSettings } from './actions';

const mockAdmin = requireAdmin as unknown as Mock;
/** What `activeYear()` reads — every ставка write is pinned to it */
const mockTemplate = db.ratingTemplate.findFirst as unknown as Mock;
const mockDepartment = db.department.findUnique as unknown as Mock;
const mockSpeciality = db.speciality.findUnique as unknown as Mock;
const mockCount = db.staff.count as unknown as Mock;
const mockStakeFind = db.departmentStake.findUnique as unknown as Mock;
const mockStakeUpsert = db.departmentStake.upsert as unknown as Mock;
const mockNormFind = db.specialityNorm.findUnique as unknown as Mock;
const mockNormUpsert = db.specialityNorm.upsert as unknown as Mock;
const mockSettingsFind = db.stakeYearSettings.findUnique as unknown as Mock;
const mockSettingsUpsert = db.stakeYearSettings.upsert as unknown as Mock;

const SESSION = { user: { id: 'admin-1', role: 'ADMIN' } };

function form(values: Record<string, string | number>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.set(k, String(v));
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAdmin.mockResolvedValue(SESSION);
  mockDepartment.mockResolvedValue({ name: 'Кафедра фізики' });
  mockSpeciality.mockResolvedValue({ name: 'Психологія' });
  mockStakeFind.mockResolvedValue(null);
  mockStakeUpsert.mockResolvedValue({ id: 'stake-1' });
  mockNormFind.mockResolvedValue(null);
  mockNormUpsert.mockResolvedValue({ id: 'norm-1' });
  mockSettingsFind.mockResolvedValue(null);
  mockSettingsUpsert.mockResolvedValue({ year: 2026 });
  mockCount.mockResolvedValue(10);
  mockTemplate.mockResolvedValue({ year: 2026 });
});

// A year arrives in the payload and used to be written against without ever
// being checked. A request made outside the UI could name any year that had a
// `Кст` row — one already closed and reported — and rewrite pay for it.
describe('the year is pinned to the active template', () => {
  it('refuses a Кст for a year that is not the active one', async () => {
    mockTemplate.mockResolvedValue({ year: 2027 });

    const result = await setDepartmentStake(
      null,
      form({ departmentId: 'd1', year: 2026, kst: '4' })
    );

    expect(result).toEqual({ error: expect.stringContaining('2027') });
    expect(mockStakeUpsert).not.toHaveBeenCalled();
  });

  it('refuses a норматив for a year that is not the active one', async () => {
    mockTemplate.mockResolvedValue({ year: 2027 });

    const result = await setSpecialityNorm(
      null,
      form({ specialityId: 's1', year: 2026, base: '13' })
    );

    expect(result).toHaveProperty('error');
    expect(mockNormUpsert).not.toHaveBeenCalled();
  });

  it('refuses a coefficient for a year that is not the active one', async () => {
    mockTemplate.mockResolvedValue({ year: 2027 });

    const result = await setStakeYearSettings(
      null,
      form({ year: 2026, contractCoefficient: '0.175' })
    );

    expect(result).toHaveProperty('error');
    expect(mockSettingsUpsert).not.toHaveBeenCalled();
  });

  it('refuses everything when no template is active at all', async () => {
    mockTemplate.mockResolvedValue(null);

    expect(
      await setDepartmentStake(null, form({ departmentId: 'd1', year: 2026, kst: '4' }))
    ).toEqual({ error: 'Рейтинговий рік ще не налаштовано' });
    expect(mockStakeUpsert).not.toHaveBeenCalled();
  });
});

describe('setDepartmentStake — access', () => {
  it('refuses anyone who is not ADMIN', async () => {
    mockAdmin.mockResolvedValue(null);
    const result = await setDepartmentStake(
      null,
      form({ departmentId: 'd1', year: 2026, kst: '2' })
    );
    expect(result).toEqual({ error: 'Недостатньо прав' });
    expect(mockStakeUpsert).not.toHaveBeenCalled();
  });
});

describe('setDepartmentStake — the pool floor', () => {
  it('stores the value as integer hundredths, never a float', async () => {
    await setDepartmentStake(null, form({ departmentId: 'd1', year: 2026, kst: '2,16' }));
    expect(mockStakeUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { kstHundredths: 216 } })
    );
  });

  it('accepts a pool exactly on the minimum', async () => {
    mockCount.mockResolvedValue(10); // 10 × 0.1 = 1.00
    const result = await setDepartmentStake(
      null,
      form({ departmentId: 'd1', year: 2026, kst: '1' })
    );
    expect(result).toEqual({ success: true });
  });

  it('refuses a pool that cannot pay the floor to everyone', async () => {
    mockCount.mockResolvedValue(18); // needs 1.80
    const result = await setDepartmentStake(
      null,
      form({ departmentId: 'd1', year: 2026, kst: '1,5' })
    );
    expect(result).toMatchObject({ error: expect.stringContaining('1,80') });
    expect(mockStakeUpsert).not.toHaveBeenCalled();
  });

  it('says how the minimum was arrived at, not just what it is', async () => {
    mockCount.mockResolvedValue(18);
    const result = await setDepartmentStake(
      null,
      form({ departmentId: 'd1', year: 2026, kst: '0' })
    );
    // «18 осіб × 0,10» is what tells somebody whether to raise the pool or
    // check the roster — a bare minimum tells them neither
    expect(result).toMatchObject({ error: expect.stringContaining('18 осіб') });
  });

  it('makes Кст = 0 impossible, which the 2025 file had twice', async () => {
    mockCount.mockResolvedValue(14);
    const result = await setDepartmentStake(
      null,
      form({ departmentId: 'd1', year: 2026, kst: '0' })
    );
    expect(result).toHaveProperty('error');
  });

  it('allows Кст = 0 only for a кафедра with nobody on it', async () => {
    mockCount.mockResolvedValue(0);
    const result = await setDepartmentStake(
      null,
      form({ departmentId: 'd1', year: 2026, kst: '0' })
    );
    expect(result).toEqual({ success: true });
  });

  it('lets the pool exceed the headcount — the bound is one-sided', async () => {
    mockCount.mockResolvedValue(20);
    // A кафедра of 20 may hold a pool of 25 ставок; no ceiling is tied to headcount
    const result = await setDepartmentStake(
      null,
      form({ departmentId: 'd1', year: 2026, kst: '25' })
    );
    expect(result).toEqual({ success: true });
  });

  it('counts every НПП on the roster, not just those meeting the licence bar', async () => {
    await setDepartmentStake(null, form({ departmentId: 'd1', year: 2026, kst: '5' }));
    expect(mockCount).toHaveBeenCalledWith({
      where: { archivedAt: null, isNpp: true, departmentId: 'd1' },
    });
  });

  it('refuses a value that is not a number', async () => {
    const result = await setDepartmentStake(
      null,
      form({ departmentId: 'd1', year: 2026, kst: 'багато' })
    );
    expect(result).toHaveProperty('error');
    expect(mockStakeUpsert).not.toHaveBeenCalled();
  });

  it('refuses a кафедра that does not exist', async () => {
    mockDepartment.mockResolvedValue(null);
    const result = await setDepartmentStake(
      null,
      form({ departmentId: 'gone', year: 2026, kst: '2' })
    );
    expect(result).toEqual({ error: 'Кафедру не знайдено' });
  });

  it('records the change in the audit log', async () => {
    await setDepartmentStake(null, form({ departmentId: 'd1', year: 2026, kst: '2' }));
    expect(db.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ entity: 'DepartmentStake', userId: 'admin-1' }),
      })
    );
  });
});

describe('setSpecialityNorm', () => {
  it('refuses anyone who is not ADMIN', async () => {
    mockAdmin.mockResolvedValue(null);
    const result = await setSpecialityNorm(
      null,
      form({ specialityId: 's1', year: 2026, base: '12' })
    );
    expect(result).toEqual({ error: 'Недостатньо прав' });
  });

  it('saves a base', async () => {
    const result = await setSpecialityNorm(
      null,
      form({ specialityId: 's1', year: 2026, base: '12.5' })
    );
    expect(result).toEqual({ success: true });
    expect(mockNormUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { base: 12.5 } })
    );
  });

  it('refuses zero — one student would be worth an infinite ставка', async () => {
    const result = await setSpecialityNorm(
      null,
      form({ specialityId: 's1', year: 2026, base: '0' })
    );
    expect(result).toHaveProperty('error');
    expect(mockNormUpsert).not.toHaveBeenCalled();
  });

  it('refuses a negative norm', async () => {
    const result = await setSpecialityNorm(
      null,
      form({ specialityId: 's1', year: 2026, base: '-3' })
    );
    expect(result).toHaveProperty('error');
  });

  it('refuses an implausibly large norm', async () => {
    const result = await setSpecialityNorm(
      null,
      form({ specialityId: 's1', year: 2026, base: '5000' })
    );
    expect(result).toHaveProperty('error');
  });
});

describe('setStakeYearSettings', () => {
  it('refuses anyone who is not ADMIN', async () => {
    mockAdmin.mockResolvedValue(null);
    const result = await setStakeYearSettings(
      null,
      form({ year: 2026, contractCoefficient: '0.175' })
    );
    expect(result).toEqual({ error: 'Недостатньо прав' });
  });

  it('saves the confirmed 2026 coefficient', async () => {
    const result = await setStakeYearSettings(
      null,
      form({ year: 2026, contractCoefficient: '0.175' })
    );
    expect(result).toEqual({ success: true });
    expect(mockSettingsUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { contractCoefficient: 0.175 } })
    );
  });

  it('refuses a coefficient above 1 — a контрактник cannot outweigh a бюджетник', async () => {
    const result = await setStakeYearSettings(
      null,
      form({ year: 2026, contractCoefficient: '1.5' })
    );
    expect(result).toHaveProperty('error');
    expect(mockSettingsUpsert).not.toHaveBeenCalled();
  });

  it('refuses zero and negatives', async () => {
    for (const value of ['0', '-0.2']) {
      const result = await setStakeYearSettings(
        null,
        form({ year: 2026, contractCoefficient: value })
      );
      expect(result, value).toHaveProperty('error');
    }
  });
});
