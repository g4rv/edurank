/**
 * The academic form values as plain data (owner, 2026-10-06) — no 'use client',
 * because a SERVER page builds them (`/profile/edit`) and a server component
 * cannot call a function exported from a client module: Next turns it into a
 * reference and refuses the call at runtime. The cards that render them live in
 * academic-fields.tsx.
 */

/** Every academic field as the inputs produce it; Zod coerces on submit */
export type AcademicFormValues = {
  pedagogicalExperience: string;
  position: string;
  academicTitle: string;
  honoraryTitles: string[];
  adminPosition: string;
  candidateDegree: string;
  candidateSpecialty: string;
  candidateDefenceDate: string;
  candidateMatchesDepartment: string;
  doctorDegree: string;
  doctorSpecialty: string;
  doctorDefenceDate: string;
  doctorMatchesDepartment: string;
  basicEducationMatch: string;
  basicEducationSpecialty: string;
};

export const EMPTY_ACADEMIC_VALUES: AcademicFormValues = {
  pedagogicalExperience: '',
  position: '',
  academicTitle: '',
  honoraryTitles: [],
  adminPosition: '',
  candidateDegree: '',
  candidateSpecialty: '',
  candidateDefenceDate: '',
  candidateMatchesDepartment: '',
  doctorDegree: '',
  doctorSpecialty: '',
  doctorDefenceDate: '',
  doctorMatchesDepartment: '',
  basicEducationMatch: '',
  basicEducationSpecialty: '',
};

/** The stored academic columns a record carries */
export interface StoredAcademic {
  pedagogicalExperience: number | null;
  position: string | null;
  academicTitle: string | null;
  honoraryTitles: string[];
  adminPosition: string | null;
  candidateDegree: string | null;
  candidateSpecialty: string | null;
  candidateDefenceDate: Date | null;
  candidateMatchesDepartment: boolean | null;
  doctorDegree: string | null;
  doctorSpecialty: string | null;
  doctorDefenceDate: Date | null;
  doctorMatchesDepartment: boolean | null;
  basicEducationMatch: boolean | null;
  basicEducationSpecialty: string | null;
}

export function academicToFormValues(staff: StoredAcademic): AcademicFormValues {
  const bool = (v: boolean | null) => (v === null ? '' : String(v));
  // `DateInput` reads and writes «YYYY-MM-DD»; the column holds UTC midnight.
  const date = (v: Date | null) => (v ? v.toISOString().slice(0, 10) : '');
  return {
    pedagogicalExperience:
      staff.pedagogicalExperience != null ? String(staff.pedagogicalExperience) : '',
    position: staff.position ?? '',
    academicTitle: staff.academicTitle ?? '',
    honoraryTitles: [...staff.honoraryTitles],
    adminPosition: staff.adminPosition ?? '',
    candidateDegree: staff.candidateDegree ?? '',
    candidateSpecialty: staff.candidateSpecialty ?? '',
    candidateDefenceDate: date(staff.candidateDefenceDate),
    candidateMatchesDepartment: bool(staff.candidateMatchesDepartment),
    doctorDegree: staff.doctorDegree ?? '',
    doctorSpecialty: staff.doctorSpecialty ?? '',
    doctorDefenceDate: date(staff.doctorDefenceDate),
    doctorMatchesDepartment: bool(staff.doctorMatchesDepartment),
    basicEducationMatch: bool(staff.basicEducationMatch),
    basicEducationSpecialty: staff.basicEducationSpecialty ?? '',
  };
}
