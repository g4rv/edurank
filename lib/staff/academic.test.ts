import { describe, expect, it } from 'vitest';
import {
  academicAuditValue,
  adminPostProblem,
  effectiveAdminPosition,
  heldAdminPositions,
  legacyMirrors,
  mirrorsForUpdate,
  offeredAdminPositions,
} from './academic';
import {
  CANDIDATE_DEGREES,
  DOCTOR_DEGREES,
  HONORARY_TITLES,
  degreeName,
  isUnspecifiedDegree,
} from './academic-options';

const EMPTY = {
  position: null,
  academicTitle: null,
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

  // Rating 1.2 is «Вчене звання» in the order and lists професор, доцент,
  // старший викладач, викладач: the звання counts, and without one the посада
  // (owner, 2026-10-06) — the higher of the two.
  it('pays 1.2 by the вчене звання where it is higher than the посада', () => {
    const rank = (position: string | null, academicTitle: string | null) =>
      legacyMirrors({ ...EMPTY, position, academicTitle } as never).academicRank;
    expect(rank('SENIOR_LECTURER', 'DOCENT')).toBe('DOCENT');
    expect(rank('DOCENT', 'PROFESSOR')).toBe('PROFESSOR');
    expect(rank('PROFESSOR', 'DOCENT')).toBe('PROFESSOR');
    expect(rank(null, 'DOCENT')).toBe('DOCENT');
    // «Старший дослідник» is not on 1.2's list — the посада counts
    expect(rank('LECTURER', 'SENIOR_RESEARCHER')).toBe('LECTURER');
    expect(rank(null, 'SENIOR_RESEARCHER')).toBeNull();
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
  // декан 80, завідувач / керівник відділу 60, заступник декана 50, …
  it('gives the old адмін. посада the highest-paying badge', () => {
    expect(legacyMirrors(EMPTY).adminPosition).toBeNull();
    expect(
      legacyMirrors({ ...EMPTY, adminPositions: ['DEPUTY_ADMISSION_SECRETARY', 'UNIT_HEAD'] })
        .adminPosition
    ).toBe('UNIT_HEAD');
    expect(
      legacyMirrors({ ...EMPTY, adminPositions: ['LAB_HEAD', 'ACADEMIC_SECRETARY'] }).adminPosition
    ).toBe('ACADEMIC_SECRETARY');
  });
});

// A завідувач and a декан hold their post because a кафедра or факультет names
// them — nobody ticks it (owner, 2026-10-06).
describe('heldAdminPositions — every post, for the ставки «Статуси» sum', () => {
  it('adds the headship to the picked posts, in rating order', () => {
    expect(
      heldAdminPositions({ adminPositions: ['LAB_HEAD', 'VICE_DEAN'], isHead: true, isDean: false })
    ).toEqual(['DEPARTMENT_HEAD', 'VICE_DEAN', 'LAB_HEAD']);
    expect(heldAdminPositions({ adminPositions: [], isHead: false, isDean: true })).toEqual([
      'DEAN',
    ]);
  });
});

describe('effectiveAdminPosition — the one post rating 1.6 pays', () => {
  const NONE = { adminPosition: null, isHead: false, isDean: false } as const;

  it('is the picked post when there is no headship', () => {
    expect(effectiveAdminPosition(NONE)).toBeNull();
    expect(effectiveAdminPosition({ ...NONE, adminPosition: 'CENTER_HEAD' })).toBe('CENTER_HEAD');
  });

  it('makes a head a завідувач and a dean a декан without a pick', () => {
    expect(effectiveAdminPosition({ ...NONE, isHead: true })).toBe('DEPARTMENT_HEAD');
    expect(effectiveAdminPosition({ ...NONE, isDean: true })).toBe('DEAN');
  });

  it('pays the headship over a lower pick — завідувач 60 beats вчений секретар 50', () => {
    expect(
      effectiveAdminPosition({ ...NONE, adminPosition: 'ACADEMIC_SECRETARY', isHead: true })
    ).toBe('DEPARTMENT_HEAD');
  });
});

// Only ONE leading post — проректор, декан, завідувач кафедри, керівник відділу —
// and a проректор holds nothing else (owner, 2026-10-06). The rest combine.
describe('adminPostProblem — which posts can be held together', () => {
  it('lets a завідувач also be вчений секретар, as an НПП wrote in', () => {
    expect(adminPostProblem(['ACADEMIC_SECRETARY'], 'DEPARTMENT_HEAD')).toBeNull();
    expect(adminPostProblem(['VICE_DEAN', 'ADMISSION_SECRETARY', 'LAB_HEAD'])).toBeNull();
  });

  it('refuses two leading posts, a headship counted', () => {
    expect(adminPostProblem(['UNIT_HEAD'], 'DEAN')).toBe('ONE_LEADING');
    expect(adminPostProblem(['UNIT_HEAD'], 'DEPARTMENT_HEAD')).toBe('ONE_LEADING');
  });

  it('does not count a stored «Декан» twice for the декан of that факультет', () => {
    expect(adminPostProblem(['DEAN', 'VICE_DEAN'], 'DEAN')).toBeNull();
  });

  it('lets a проректор hold nothing else at all', () => {
    expect(adminPostProblem(['VICE_RECTOR'])).toBeNull();
    expect(adminPostProblem(['VICE_RECTOR', 'ACADEMIC_SECRETARY'])).toBe('VICE_RECTOR_ALONE');
    expect(adminPostProblem(['VICE_RECTOR'], 'DEAN')).toBe('VICE_RECTOR_ALONE');
  });
});

describe('offeredAdminPositions — what the badge list still offers', () => {
  it('never offers «Декан» or «Завідувач кафедри» — those are automatic', () => {
    const offered = offeredAdminPositions([]);
    expect(offered).not.toContain('DEAN');
    expect(offered).not.toContain('DEPARTMENT_HEAD');
    expect(offered).toContain('VICE_RECTOR');
    expect(offered).toContain('UNIT_HEAD');
  });

  it('offers a завідувач no second leading post and no проректор', () => {
    const offered = offeredAdminPositions([], 'DEPARTMENT_HEAD');
    expect(offered).not.toContain('VICE_RECTOR');
    expect(offered).not.toContain('UNIT_HEAD');
    expect(offered).toContain('ACADEMIC_SECRETARY');
  });

  it('offers a проректор nothing more', () => {
    expect(offeredAdminPositions(['VICE_RECTOR'])).toEqual([]);
  });
});

describe('the option lists', () => {
  it('match the university’s lists in size', () => {
    expect(CANDIDATE_DEGREES).toHaveLength(18);
    expect(DOCTOR_DEGREES).toHaveLength(17);
    expect(HONORARY_TITLES).toHaveLength(12);
  });

  // «There should be no blank option» (owner, 2026-10-06): the migrated
  // placeholder is stored, never offered, and reads as the plain level.
  it('offer no «branch not chosen» placeholder, and name one as the plain level', () => {
    const keys = [...CANDIDATE_DEGREES, ...DOCTOR_DEGREES].map((o) => o.value);
    expect(keys.some(isUnspecifiedDegree)).toBe(false);
    expect(degreeName('candidate', 'candidate_unspecified')).toBe('Кандидат наук');
    expect(degreeName('doctor', 'doctor_unspecified')).toBe('Доктор наук');
    expect(degreeName('candidate', 'cand_pedagogy')).toBe('Кандидат педагогічних наук');
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
    academicTitle: null,
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
