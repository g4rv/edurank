import { describe, expect, it } from 'vitest';
import { legacyMirrors } from './academic';
import { CANDIDATE_DEGREES, DOCTOR_DEGREES, HONORARY_TITLES } from './academic-options';

const EMPTY = {
  position: null,
  candidateDegree: null,
  candidateDefenceDate: null,
  doctorDegree: null,
  doctorDefenceDate: null,
  adminPositions: [],
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

  // Rating 1.6 pays the highest badge only (owner, 2026-10-06): проректор 100,
  // декан 80, завідувач 60, заступник декана 50, заст. завідувача 40, …
  it('gives the old адмін. посада the highest-paying badge', () => {
    expect(legacyMirrors(EMPTY).adminPosition).toBeNull();
    expect(
      legacyMirrors({
        ...EMPTY,
        adminPositions: ['DEPUTY_ADMISSION_SECRETARY', 'DEPARTMENT_OR_UNIT_HEAD'],
      }).adminPosition
    ).toBe('DEPARTMENT_OR_UNIT_HEAD');
    expect(
      legacyMirrors({ ...EMPTY, adminPositions: ['VICE_DEAN_OR_SECRETARY', 'DEAN'] }).adminPosition
    ).toBe('DEAN');
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
