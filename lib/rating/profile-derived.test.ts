import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: {
    staff: { findMany: vi.fn() },
    activity: { findMany: vi.fn() },
    ratingTemplate: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { db } from '@/lib/db';
import { catalogueType } from './db-specs';
import {
  backfillProfileDerived,
  derivedEvidence,
  syncProfileDerived,
  PROFILE_DERIVED_CODES,
  PROFILE_DERIVED_STAFF_FIELDS,
} from './profile-derived';

const emptyStaff = {
  isNpp: true,
  archivedAt: null,
  pedagogicalExperience: null,
  academicRank: null,
  scientificDegree: null,
  degreeMatchesDepartment: null,
  adminPosition: null,
  basicEducationMatch: null,
  basicEducationSpecialty: null,
  wosCitationCount: null,
  scopusCitationCount: null,
  googleScholarCitationCount: null,
} as const;

describe('derivedEvidence', () => {
  it('returns null for every code on an empty profile', () => {
    for (const code of PROFILE_DERIVED_CODES) {
      expect(derivedEvidence(code, { ...emptyStaff })).toBeNull();
    }
  });

  it('maps pedagogical experience to a MULT value', () => {
    expect(
      derivedEvidence('pedagogical_experience', { ...emptyStaff, pedagogicalExperience: 21 })
    ).toEqual({ value: 21 });
    expect(
      derivedEvidence('pedagogical_experience', { ...emptyStaff, pedagogicalExperience: 0 })
    ).toBeNull();
  });

  it('maps academic rank enum to the select option key', () => {
    expect(derivedEvidence('academic_rank', { ...emptyStaff, academicRank: 'PROFESSOR' })).toEqual({
      option: 'professor',
    });
    expect(
      derivedEvidence('academic_rank', { ...emptyStaff, academicRank: 'SENIOR_LECTURER' })
    ).toEqual({ option: 'senior_lecturer' });
  });

  it('maps scientific degree with and without department match', () => {
    expect(
      derivedEvidence('scientific_degree', {
        ...emptyStaff,
        scientificDegree: 'DOCTOR',
        degreeMatchesDepartment: true,
      })
    ).toEqual({ option: 'doctor_dept_match' });
    expect(
      derivedEvidence('scientific_degree', {
        ...emptyStaff,
        scientificDegree: 'CANDIDATE',
        degreeMatchesDepartment: null,
      })
    ).toEqual({ option: 'phd' });
  });

  it('maps admin position enum to the select option key', () => {
    expect(derivedEvidence('admin_position', { ...emptyStaff, adminPosition: 'DEAN' })).toEqual({
      option: 'dean',
    });
    expect(
      derivedEvidence('admin_position', { ...emptyStaff, adminPosition: 'LAB_OR_CENTER_HEAD' })
    ).toEqual({ option: 'lab_or_center_head' });
  });

  it('maps basic education only when confirmed', () => {
    expect(
      derivedEvidence('basic_education_match', {
        ...emptyStaff,
        basicEducationMatch: true,
        basicEducationSpecialty: 'Історія',
      })
    ).toEqual({ confirmed: true, specialty: 'Історія' });
    expect(
      derivedEvidence('basic_education_match', { ...emptyStaff, basicEducationMatch: false })
    ).toBeNull();
  });

  it('maps h-index fields, treating 0 as no indicator', () => {
    expect(derivedEvidence('citations_wos', { ...emptyStaff, wosCitationCount: 4 })).toEqual({
      value: 4,
    });
    expect(derivedEvidence('citations_wos', { ...emptyStaff, wosCitationCount: 0 })).toBeNull();
    expect(
      derivedEvidence('citations_scholar', { ...emptyStaff, googleScholarCitationCount: 7 })
    ).toEqual({ value: 7 });
  });

  it('exposes each source staff field exactly once', () => {
    expect(new Set(PROFILE_DERIVED_STAFF_FIELDS).size).toBe(PROFILE_DERIVED_STAFF_FIELDS.length);
  });
});

// ── syncProfileDerived against a mocked transaction ─────────────────────────

// A derived ActivityType row: the sync scores it off the row's own specs, so
// the mock carries the same JSON columns the seed writes.
const derivedType = (code: string, coefficient = 1) => {
  const { evidenceFields, scoring } = catalogueType(code).specs;
  return { id: `type-${code}`, code, coefficient, evidenceFields, scoring };
};

type ExistingRow = { id: string; evidence: unknown; score: number; submittedByRole?: string };

function makeTx(opts: {
  template?: object | null;
  staff?: object | null;
  existing?: Record<string, ExistingRow[]>;
}) {
  return {
    ratingTemplate: {
      findFirst: vi.fn().mockResolvedValue(opts.template === undefined ? null : opts.template),
    },
    staff: { findUnique: vi.fn().mockResolvedValue(opts.staff ?? null) },
    activity: {
      // sync asks for all derived types at once; recompute queries by staffId+year only
      findMany: vi.fn(({ where }: { where: { activityTypeId?: { in: string[] } } }) => {
        const typeIds = where.activityTypeId?.in;
        if (!typeIds) return Promise.resolve([]);
        const rows = typeIds.flatMap((typeId) =>
          (opts.existing?.[typeId.replace('type-', '')] ?? []).map((r) => ({
            submittedByRole: 'SYSTEM',
            activityTypeId: typeId,
            ...r,
          }))
        );
        return Promise.resolve(rows);
      }),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      update: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({}),
    },
    ratingEntry: { upsert: vi.fn().mockResolvedValue({}) },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('syncProfileDerived', () => {
  it('does nothing when there is no active open template', async () => {
    const tx = makeTx({ template: null });
    await syncProfileDerived(tx as never, 'staff-1');
    expect(tx.staff.findUnique).not.toHaveBeenCalled();
  });

  it('creates one APPROVED SYSTEM activity per filled profile field', async () => {
    const tx = makeTx({
      template: {
        year: 2026,
        activityTypes: [derivedType('academic_rank'), derivedType('admin_position')],
      },
      staff: { ...emptyStaff, academicRank: 'DOCENT' },
    });
    await syncProfileDerived(tx as never, 'staff-1');

    const created = tx.activity.createMany.mock.calls[0][0].data;
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      activityTypeId: 'type-academic_rank',
      year: 2026,
      status: 'APPROVED',
      submittedByRole: 'SYSTEM',
      evidence: { option: 'docent' },
      score: 30,
    });
    expect(tx.ratingEntry.upsert).toHaveBeenCalledTimes(1);
  });

  it('updates the existing row instead of duplicating, skips when unchanged', async () => {
    const tx = makeTx({
      template: { year: 2026, activityTypes: [derivedType('academic_rank')] },
      staff: { ...emptyStaff, academicRank: 'PROFESSOR' },
      existing: {
        academic_rank: [{ id: 'act-1', evidence: { option: 'docent' }, score: 30 }],
      },
    });
    await syncProfileDerived(tx as never, 'staff-1');
    expect(tx.activity.createMany).not.toHaveBeenCalled();
    expect(tx.activity.update).toHaveBeenCalledWith({
      where: { id: 'act-1' },
      data: {
        evidence: { option: 'professor' },
        computedValue: 50,
        score: 50,
        status: 'APPROVED',
        submittedByRole: 'SYSTEM',
      },
    });

    // Second run with matching stored state → no write, no recompute
    const txSame = makeTx({
      template: { year: 2026, activityTypes: [derivedType('academic_rank')] },
      staff: { ...emptyStaff, academicRank: 'PROFESSOR' },
      existing: {
        academic_rank: [{ id: 'act-1', evidence: { option: 'professor' }, score: 50 }],
      },
    });
    await syncProfileDerived(txSame as never, 'staff-1');
    expect(txSame.activity.update).not.toHaveBeenCalled();
    expect(txSame.ratingEntry.upsert).not.toHaveBeenCalled();
  });

  it('deletes the derived row when the profile field is cleared', async () => {
    const tx = makeTx({
      template: { year: 2026, activityTypes: [derivedType('admin_position')] },
      staff: { ...emptyStaff },
      existing: {
        admin_position: [{ id: 'act-2', evidence: { option: 'dean' }, score: 80 }],
      },
    });
    await syncProfileDerived(tx as never, 'staff-1');
    expect(tx.activity.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['act-2'] } } });
    expect(tx.ratingEntry.upsert).toHaveBeenCalledTimes(1);
  });

  // Archiving is what takes someone off the roster, and the open year has to
  // stop counting them the moment it happens — including the indicators that
  // come from their profile, which nobody enters by hand and which would
  // otherwise keep scoring for a person on декретна відпустка.
  it('drops the derived rows of an archived person', async () => {
    const tx = makeTx({
      template: { year: 2026, activityTypes: [derivedType('academic_rank')] },
      staff: { ...emptyStaff, academicRank: 'PROFESSOR', archivedAt: new Date('2026-03-01') },
      existing: {
        academic_rank: [{ id: 'act-1', evidence: { option: 'professor' }, score: 50 }],
      },
    });
    await syncProfileDerived(tx as never, 'staff-1');

    expect(tx.activity.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['act-1'] } } });
    expect(tx.activity.createMany).not.toHaveBeenCalled();
    expect(tx.ratingEntry.upsert).toHaveBeenCalledTimes(1);
  });

  // …and restoring them fills the same rows back in, which is the whole point
  // of archiving rather than deleting: nobody retypes a returning person.
  it('refills the derived rows once the archive is lifted', async () => {
    const tx = makeTx({
      template: { year: 2026, activityTypes: [derivedType('academic_rank')] },
      staff: { ...emptyStaff, academicRank: 'PROFESSOR', archivedAt: null },
    });
    await syncProfileDerived(tx as never, 'staff-1');

    const created = tx.activity.createMany.mock.calls[0][0].data;
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ evidence: { option: 'professor' }, score: 50 });
  });

  it('purges duplicate rows, keeping the oldest as the synced one', async () => {
    const tx = makeTx({
      template: { year: 2026, activityTypes: [derivedType('admin_position')] },
      staff: { ...emptyStaff, adminPosition: 'DEAN' },
      existing: {
        admin_position: [
          { id: 'act-old', evidence: { option: 'dean' }, score: 80 },
          { id: 'act-farm-1', evidence: { option: 'vice_rector' }, score: 100 },
          { id: 'act-farm-2', evidence: { option: 'vice_rector' }, score: 100 },
        ],
      },
    });
    await syncProfileDerived(tx as never, 'staff-1');
    expect(tx.activity.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['act-farm-1', 'act-farm-2'] } },
    });
    expect(tx.activity.createMany).not.toHaveBeenCalled();
    expect(tx.ratingEntry.upsert).toHaveBeenCalledTimes(1);
  });

  it('removes all derived rows when the staff is no longer НПП', async () => {
    const tx = makeTx({
      template: { year: 2026, activityTypes: [derivedType('academic_rank')] },
      staff: { ...emptyStaff, isNpp: false, academicRank: 'PROFESSOR' },
      existing: {
        academic_rank: [{ id: 'act-3', evidence: { option: 'professor' }, score: 50 }],
      },
    });
    await syncProfileDerived(tx as never, 'staff-1');
    expect(tx.activity.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['act-3'] } } });
    expect(tx.activity.createMany).not.toHaveBeenCalled();
  });

  it('reads every derived type in one query, not one per type', async () => {
    const tx = makeTx({
      template: {
        year: 2026,
        activityTypes: [derivedType('academic_rank'), derivedType('admin_position')],
      },
      staff: { ...emptyStaff },
    });
    await syncProfileDerived(tx as never, 'staff-1');

    expect(tx.activity.findMany).toHaveBeenCalledTimes(1);
    expect(tx.activity.findMany.mock.calls[0][0].where.activityTypeId).toEqual({
      in: ['type-academic_rank', 'type-admin_position'],
    });
  });

  it('writes nothing at all when the profile already matches', async () => {
    const tx = makeTx({
      template: { year: 2026, activityTypes: [derivedType('academic_rank')] },
      staff: { ...emptyStaff, academicRank: 'PROFESSOR' },
      existing: {
        academic_rank: [{ id: 'act-1', evidence: { option: 'professor' }, score: 50 }],
      },
    });
    await syncProfileDerived(tx as never, 'staff-1');

    expect(tx.activity.deleteMany).not.toHaveBeenCalled();
    expect(tx.activity.update).not.toHaveBeenCalled();
    expect(tx.activity.createMany).not.toHaveBeenCalled();
    expect(tx.ratingEntry.upsert).not.toHaveBeenCalled();
  });
});

// ── backfillProfileDerived: one batched sweep, not a transaction per person ──

describe('backfillProfileDerived', () => {
  const mockTemplateFirst = db.ratingTemplate.findFirst as unknown as ReturnType<typeof vi.fn>;
  const mockStaffMany = db.staff.findMany as unknown as ReturnType<typeof vi.fn>;
  const mockActivityMany = db.activity.findMany as unknown as ReturnType<typeof vi.fn>;
  const mockTransaction = db.$transaction as unknown as ReturnType<typeof vi.fn>;

  function txSpy() {
    const tx = {
      activity: {
        findMany: vi.fn().mockResolvedValue([]),
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
        update: vi.fn().mockResolvedValue({}),
        deleteMany: vi.fn().mockResolvedValue({}),
      },
      ratingEntry: { upsert: vi.fn().mockResolvedValue({}) },
    };
    mockTransaction.mockImplementation(async (fn: (t: unknown) => Promise<unknown>) => fn(tx));
    return tx;
  }

  it('does nothing without an active open template', async () => {
    mockTemplateFirst.mockResolvedValue(null);
    expect(await backfillProfileDerived()).toBe(0);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('reads the whole picture in a fixed number of queries', async () => {
    mockTemplateFirst.mockResolvedValue({
      year: 2026,
      activityTypes: [derivedType('academic_rank'), derivedType('admin_position')],
    });
    mockStaffMany.mockResolvedValue(
      Array.from({ length: 50 }, (_, i) => ({
        id: `staff-${i}`,
        ...emptyStaff,
        academicRank: 'DOCENT',
      }))
    );
    mockActivityMany.mockResolvedValue([]);
    txSpy();

    expect(await backfillProfileDerived()).toBe(50);
    // 50 staff, still one read each of template / staff / activities — and ONE transaction
    expect(mockTemplateFirst).toHaveBeenCalledTimes(1);
    expect(mockStaffMany).toHaveBeenCalledTimes(1);
    expect(mockActivityMany).toHaveBeenCalledTimes(1);
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  it('creates every missing row in a single createMany', async () => {
    mockTemplateFirst.mockResolvedValue({
      year: 2026,
      activityTypes: [derivedType('academic_rank')],
    });
    mockStaffMany.mockResolvedValue([
      { id: 'staff-1', ...emptyStaff, academicRank: 'PROFESSOR' },
      { id: 'staff-2', ...emptyStaff, academicRank: 'DOCENT' },
    ]);
    mockActivityMany.mockResolvedValue([]);
    const tx = txSpy();

    expect(await backfillProfileDerived()).toBe(2);
    expect(tx.activity.createMany).toHaveBeenCalledTimes(1);
    const created = tx.activity.createMany.mock.calls[0][0].data;
    expect(created).toHaveLength(2);
    expect(created.map((c: { score: number }) => c.score)).toEqual([50, 30]);
  });

  it('skips staff whose derived rows already match', async () => {
    mockTemplateFirst.mockResolvedValue({
      year: 2026,
      activityTypes: [derivedType('academic_rank')],
    });
    mockStaffMany.mockResolvedValue([
      { id: 'staff-1', ...emptyStaff, academicRank: 'PROFESSOR' },
      { id: 'staff-2', ...emptyStaff, academicRank: 'DOCENT' },
    ]);
    // staff-1 is already correct; staff-2 has nothing yet
    mockActivityMany.mockResolvedValue([
      {
        id: 'act-1',
        staffId: 'staff-1',
        activityTypeId: 'type-academic_rank',
        evidence: { option: 'professor' },
        score: 50,
        submittedByRole: 'SYSTEM',
      },
    ]);
    const tx = txSpy();

    expect(await backfillProfileDerived()).toBe(1);
    const created = tx.activity.createMany.mock.calls[0][0].data;
    expect(created).toHaveLength(1);
    expect(created[0].staffId).toBe('staff-2');
  });

  it('recomputes only the staff it actually changed', async () => {
    mockTemplateFirst.mockResolvedValue({
      year: 2026,
      activityTypes: [derivedType('academic_rank')],
    });
    mockStaffMany.mockResolvedValue([
      { id: 'staff-1', ...emptyStaff, academicRank: 'PROFESSOR' },
      { id: 'staff-untouched', ...emptyStaff },
    ]);
    mockActivityMany.mockResolvedValue([]);
    const tx = txSpy();

    await backfillProfileDerived();
    expect(tx.ratingEntry.upsert).toHaveBeenCalledTimes(1);
    expect(tx.ratingEntry.upsert.mock.calls[0][0].where.staffId_year.staffId).toBe('staff-1');
  });

  it('opens no transaction when nothing needs changing', async () => {
    mockTemplateFirst.mockResolvedValue({
      year: 2026,
      activityTypes: [derivedType('academic_rank')],
    });
    mockStaffMany.mockResolvedValue([{ id: 'staff-1', ...emptyStaff }]);
    mockActivityMany.mockResolvedValue([]);

    expect(await backfillProfileDerived()).toBe(0);
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});
