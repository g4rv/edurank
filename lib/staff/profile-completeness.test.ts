import { describe, it, expect } from 'vitest';
import { missingProfileFields, profileCompleteness } from './profile-completeness';

const FULL = {
  isNpp: true,
  phone: '+380441234567',
  orcidId: '0000-0002-1825-0097',
  wosUrl: 'https://www.webofscience.com/x',
  scopusUrl: 'https://www.scopus.com/x',
  googleScholarUrl: 'https://scholar.google.com/x',
  academicRank: 'PROFESSOR',
  scientificDegree: 'DOCTOR',
  pedagogicalExperience: 12,
  degreeDefenceDate: new Date('2015-03-01'),
  basicEducationSpecialty: 'Математика',
  department: { id: 'd1' },
  partTimeDepartments: [],
};

describe('missingProfileFields', () => {
  it('finds nothing on a complete record', () => {
    const m = missingProfileFields(FULL);
    expect(m.own).toEqual([]);
    expect(m.administered).toEqual([]);
  });

  it('separates what the person can fix from what кадри fill', () => {
    const m = missingProfileFields({
      ...FULL,
      phone: null,
      orcidId: null,
      academicRank: null,
      pedagogicalExperience: null,
    });
    expect(m.own).toEqual(['Телефон', 'ORCID']);
    expect(m.administered).toEqual(['Вчене звання', 'Педагогічний стаж']);
  });

  it('treats an empty string as unfilled, not as a value', () => {
    expect(missingProfileFields({ ...FULL, phone: '' }).own).toContain('Телефон');
  });

  it('never reports academic gaps for an administrative employee', () => {
    // Somebody who is not НПП has no вчене звання to be missing — saying so
    // would read as a defect in their record rather than a fact about the job.
    const m = missingProfileFields({
      ...FULL,
      isNpp: false,
      academicRank: null,
      scientificDegree: null,
      pedagogicalExperience: null,
      degreeDefenceDate: null,
      basicEducationSpecialty: null,
      department: null,
    });
    expect(m.administered).toEqual([]);
  });

  it('reports a missing кафедра only when BOTH the primary and сумісництво are absent', () => {
    // A сумісник has no primary кафедра by design — a null departmentId IS the
    // marker — so the additional one alone must count as attached.
    const partTimeOnly = missingProfileFields({
      ...FULL,
      department: null,
      partTimeDepartments: [{ department: { id: 'd2' } }],
    });
    expect(partTimeOnly.administered).not.toContain('Кафедра');

    const attachedToNothing = missingProfileFields({
      ...FULL,
      department: null,
      partTimeDepartments: [],
    });
    expect(attachedToNothing.administered).toContain('Кафедра');
  });
});

describe('profileCompleteness', () => {
  it('is 100 when nothing is missing', () => {
    expect(profileCompleteness(FULL)).toBe(100);
  });

  it('falls as fields empty out', () => {
    const half = profileCompleteness({ ...FULL, phone: null, orcidId: null, academicRank: null });
    expect(half).toBeLessThan(100);
    expect(half).toBeGreaterThan(0);
  });

  it('scores a non-НПП only on the fields that apply to them', () => {
    const admin = { ...FULL, isNpp: false };
    expect(profileCompleteness(admin)).toBe(100);
    expect(profileCompleteness({ ...admin, phone: null })).toBe(80); // 4 of 5
  });
});
