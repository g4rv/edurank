import { describe, expect, it } from 'vitest';
import {
  academicAuditValue,
  effectiveAdminPosition,
  legacyMirrors,
  mirrorsForUpdate,
} from './academic';
import { CANDIDATE_DEGREES, DOCTOR_DEGREES, HONORARY_TITLES } from './academic-options';

const EMPTY = {
  position: null,
  candidateDegree: null,
  candidateDefenceDate: null,
  candidateMatchesDepartment: null,
  doctorDegree: null,
  doctorDefenceDate: null,
  doctorMatchesDepartment: null,
} as const;

describe('legacyMirrors — the old columns the rating still reads (2026-10-06)', () => {
  it('copies посада into the old «вчене звання» unchanged', () => {
    expect(legacyMirrors({ ...EMPTY, position: 'SENIOR_LECTURER' }).academicRank).toBe(
      'SENIOR_LECTURER'
    );
    expect(legacyMirrors(EMPTY).academicRank).toBeNull();
  });

  it('gives the old ступінь the HIGHEST filled level', () => {
    expect(legacyMirrors(EMPTY).scientificDegree).toBeNull();
    expect(legacyMirrors({ ...EMPTY, candidateDegree: 'phd' }).scientificDegree).toBe('CANDIDATE');
    expect(
      legacyMirrors({ ...EMPTY, candidateDegree: 'cand_history', doctorDegree: 'doc_history' })
        .scientificDegree
    ).toBe('DOCTOR');
    // The migration's «уточніть галузь» keys keep their level.
    expect(legacyMirrors({ ...EMPTY, doctorDegree: 'doctor_unspecified' }).scientificDegree).toBe(
      'DOCTOR'
    );
  });

  it('gives the old defence date the newer of the two', () => {
    const cand = new Date('2010-05-01T00:00:00Z');
    const doc = new Date('2021-11-20T00:00:00Z');
    expect(
      legacyMirrors({ ...EMPTY, candidateDefenceDate: cand, doctorDefenceDate: doc })
        .degreeDefenceDate
    ).toEqual(doc);
    expect(legacyMirrors({ ...EMPTY, candidateDefenceDate: cand }).degreeDefenceDate).toEqual(cand);
    expect(legacyMirrors(EMPTY).degreeDefenceDate).toBeNull();
  });

  // Rating 1.3 pays «за спеціальністю кафедри» for the degree it pays for —
  // the highest one — so the old single answer is that degree's (2026-10-06).
  it('gives the old «ступінь відповідає кафедрі» the highest degree’s answer', () => {
    expect(
      legacyMirrors({
        ...EMPTY,
        candidateDegree: 'cand_history',
        candidateMatchesDepartment: true,
        doctorDegree: 'doc_history',
        doctorMatchesDepartment: false,
      }).degreeMatchesDepartment
    ).toBe(false);
    expect(
      legacyMirrors({ ...EMPTY, candidateDegree: 'phd', candidateMatchesDepartment: true })
        .degreeMatchesDepartment
    ).toBe(true);
    expect(legacyMirrors(EMPTY).degreeMatchesDepartment).toBeNull();
  });
});

// A завідувач and a декан hold their post because a кафедра or факультет names
// them — nobody ticks it (owner, 2026-10-06). One post counts, the highest:
// проректор 100, декан 80, завідувач 60, заступник декана 50, …
describe('effectiveAdminPosition — the one post rating 1.6 and «Статуси» read', () => {
  const NONE = { adminPosition: null, isHead: false, isDean: false } as const;

  it('is the picked post when there is no headship', () => {
    expect(effectiveAdminPosition(NONE)).toBeNull();
    expect(effectiveAdminPosition({ ...NONE, adminPosition: 'LAB_OR_CENTER_HEAD' })).toBe(
      'LAB_OR_CENTER_HEAD'
    );
  });

  it('makes a head a завідувач and a dean a декан without a pick', () => {
    expect(effectiveAdminPosition({ ...NONE, isHead: true })).toBe('DEPARTMENT_OR_UNIT_HEAD');
    expect(effectiveAdminPosition({ ...NONE, isDean: true })).toBe('DEAN');
  });

  it('keeps the higher of the pick and the headship', () => {
    expect(effectiveAdminPosition({ ...NONE, adminPosition: 'VICE_RECTOR', isDean: true })).toBe(
      'VICE_RECTOR'
    );
    expect(
      effectiveAdminPosition({ ...NONE, adminPosition: 'VICE_DEAN_OR_SECRETARY', isHead: true })
    ).toBe('DEPARTMENT_OR_UNIT_HEAD');
  });
});

describe('the option lists', () => {
  it('match the university’s lists in size, plus one «уточніть» key per level', () => {
    expect(CANDIDATE_DEGREES).toHaveLength(18 + 1);
    expect(DOCTOR_DEGREES).toHaveLength(17 + 1);
    expect(HONORARY_TITLES).toHaveLength(12);
  });

  it('never repeat a key', () => {
    for (const list of [CANDIDATE_DEGREES, DOCTOR_DEGREES, HONORARY_TITLES]) {
      const keys = list.map((o) => o.value);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});

describe('mirrorsForUpdate — merge what was saved with what is stored', () => {
  const STORED = {
    position: 'DOCENT',
    candidateDegree: 'cand_history',
    candidateDefenceDate: null,
    candidateMatchesDepartment: null,
    doctorDegree: null,
    doctorDefenceDate: null,
    doctorMatchesDepartment: null,
  } as const;

  it('leaves the mirrors alone when no source field was saved', () => {
    expect(mirrorsForUpdate(STORED, { phone: '+380671234567' })).toBeNull();
  });

  // An editor granted only one field still keeps the others in the mirrors.
  it('derives from the stored values for every field not being saved', () => {
    expect(mirrorsForUpdate(STORED, { doctorDegree: 'doc_history' })).toEqual({
      academicRank: 'DOCENT',
      scientificDegree: 'DOCTOR',
      degreeDefenceDate: null,
      degreeMatchesDepartment: null,
    });
  });

  it('lets a cleared field clear its mirror', () => {
    expect(mirrorsForUpdate(STORED, { position: null })?.academicRank).toBeNull();
  });
});

describe('academicAuditValue — what the audit log prints', () => {
  it('prints badge lists and degree keys as their labels', () => {
    expect(academicAuditValue('honoraryTitles', ['merited_teacher', 'people_artist'])).toBe(
      'Заслужений вчитель, Народний художник'
    );
    expect(academicAuditValue('adminPosition', 'VICE_RECTOR')).toBe('Проректор');
    expect(academicAuditValue('adminPosition', null)).toBeNull();
    expect(academicAuditValue('candidateDegree', 'phd')).toBe('Доктор філософії (PhD)');
    expect(academicAuditValue('position', 'DOCENT')).toBe('Доцент');
  });

  it('passes every other value through', () => {
    expect(academicAuditValue('phone', '+380671234567')).toBe('+380671234567');
  });
});
