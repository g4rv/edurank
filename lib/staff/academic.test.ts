import { describe, expect, it } from 'vitest';
import {
  academicAuditValue,
  adminPostProblem,
  effectiveAdminPosition,
  legacyMirrors,
  mirrorsForUpdate,
  offeredAdminPositions,
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

// A завідувач and a декан hold their post because a кафедра or факультет names
// them — nobody ticks it (owner, 2026-10-06). One post is paid, the highest.
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

  it('pays the headship over a lower pick — завідувач 60 beats вчений секретар 50', () => {
    expect(
      effectiveAdminPosition({ ...NONE, adminPosition: 'VICE_DEAN_OR_SECRETARY', isHead: true })
    ).toBe('DEPARTMENT_OR_UNIT_HEAD');
  });
});

// Only ONE leading post — проректор, декан, завідувач / керівник відділу — and a
// проректор holds nothing else (owner, 2026-10-06). The rest combine freely.
describe('adminPostProblem — which posts can be held together', () => {
  it('lets a завідувач also be вчений секретар, as an НПП wrote in', () => {
    expect(adminPostProblem(['VICE_DEAN_OR_SECRETARY'], 'DEPARTMENT_OR_UNIT_HEAD')).toBeNull();
    expect(adminPostProblem(['VICE_DEAN_OR_SECRETARY', 'LAB_OR_CENTER_HEAD'])).toBeNull();
  });

  it('refuses two leading posts, a headship counted', () => {
    expect(adminPostProblem(['DEPARTMENT_OR_UNIT_HEAD'], 'DEAN')).toBe('ONE_LEADING');
    // A picked «Керівник відділу» is a відділ — a second post beside the кафедра.
    expect(adminPostProblem(['DEPARTMENT_OR_UNIT_HEAD'], 'DEPARTMENT_OR_UNIT_HEAD')).toBe(
      'ONE_LEADING'
    );
  });

  it('does not count a stored «Декан» twice for the декан of that факультет', () => {
    expect(adminPostProblem(['DEAN', 'VICE_DEAN_OR_SECRETARY'], 'DEAN')).toBeNull();
  });

  it('lets a проректор hold nothing else at all', () => {
    expect(adminPostProblem(['VICE_RECTOR'])).toBeNull();
    expect(adminPostProblem(['VICE_RECTOR', 'VICE_DEAN_OR_SECRETARY'])).toBe('VICE_RECTOR_ALONE');
    expect(adminPostProblem(['VICE_RECTOR'], 'DEAN')).toBe('VICE_RECTOR_ALONE');
  });
});

describe('offeredAdminPositions — what the badge list still offers', () => {
  it('never offers «Декан»', () => {
    expect(offeredAdminPositions([])).not.toContain('DEAN');
    expect(offeredAdminPositions([])).toContain('VICE_RECTOR');
  });

  it('offers a завідувач no second leading post and no проректор', () => {
    const offered = offeredAdminPositions([], 'DEPARTMENT_OR_UNIT_HEAD');
    expect(offered).not.toContain('VICE_RECTOR');
    expect(offered).not.toContain('DEPARTMENT_OR_UNIT_HEAD');
    expect(offered).toContain('VICE_DEAN_OR_SECRETARY');
  });

  it('offers a проректор nothing more', () => {
    expect(offeredAdminPositions(['VICE_RECTOR'])).toEqual([]);
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
    adminPositions: ['DEAN'],
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
      adminPosition: 'DEAN',
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
    expect(academicAuditValue('adminPositions', ['DEAN'])).toBe('Декан');
    expect(academicAuditValue('adminPositions', [])).toBeNull();
    expect(academicAuditValue('candidateDegree', 'phd')).toBe('Доктор філософії (PhD)');
    expect(academicAuditValue('position', 'DOCENT')).toBe('Доцент');
  });

  it('passes every other value through', () => {
    expect(academicAuditValue('phone', '+380671234567')).toBe('+380671234567');
  });
});
