import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: { staff: { findMany: vi.fn() }, $transaction: vi.fn() },
}));

import {
  derivedEvidence,
  syncProfileDerived,
  PROFILE_DERIVED_CODES,
  PROFILE_DERIVED_STAFF_FIELDS,
} from './profile-derived';

const emptyStaff = {
  isNpp: true,
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

const derivedType = (code: string, coefficient = 1) => ({ id: `type-${code}`, code, coefficient });

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
      // sync queries by activityTypeId; recompute queries by staffId+year only
      findMany: vi.fn(({ where }: { where: { activityTypeId?: string } }) => {
        if (!where.activityTypeId) return Promise.resolve([]);
        const code = where.activityTypeId.replace('type-', '');
        const rows = opts.existing?.[code] ?? [];
        return Promise.resolve(rows.map((r) => ({ submittedByRole: 'SYSTEM', ...r })));
      }),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
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

    expect(tx.activity.create).toHaveBeenCalledTimes(1);
    const created = tx.activity.create.mock.calls[0][0].data;
    expect(created).toMatchObject({
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
    expect(tx.activity.create).not.toHaveBeenCalled();
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
    expect(tx.activity.delete).toHaveBeenCalledWith({ where: { id: 'act-2' } });
    expect(tx.ratingEntry.upsert).toHaveBeenCalledTimes(1);
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
    expect(tx.activity.create).not.toHaveBeenCalled();
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
    expect(tx.activity.delete).toHaveBeenCalledWith({ where: { id: 'act-3' } });
    expect(tx.activity.create).not.toHaveBeenCalled();
  });
});
