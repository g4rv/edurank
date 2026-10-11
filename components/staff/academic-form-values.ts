/**
 * The academic form values as plain data (owner, 2026-10-06) — no 'use client',
 * because a SERVER page builds them (`/profile/edit`) and a server component
 * cannot call a function exported from a client module: Next turns it into a
 * reference and refuses the call at runtime. The cards that render them live in
 * academic-fields.tsx.
 */

import { degreesOf } from '@/lib/staff/academic';

/** One diploma as its inputs hold it (owner, 2026-10-10) */
export type DegreeFormRow = {
  degree: string;
  specialty: string;
  defenceDate: string;
  matchesDepartment: string;
};

/** A blank diploma — what «Додати освіту» starts the popup from */
export const EMPTY_DEGREE_ROW: DegreeFormRow = {
  degree: '',
  specialty: '',
  defenceDate: '',
  matchesDepartment: '',
};

/** Every academic field as the inputs produce it; Zod coerces on submit */
export type AcademicFormValues = {
  pedagogicalExperience: string;
  position: string;
  academicTitle: string;
  honoraryTitles: string[];
  adminPositions: string[];
  degrees: DegreeFormRow[];
  basicEducationMatch: string;
  basicEducationSpecialty: string;
};

export const EMPTY_ACADEMIC_VALUES: AcademicFormValues = {
  pedagogicalExperience: '',
  position: '',
  academicTitle: '',
  honoraryTitles: [],
  adminPositions: [],
  degrees: [],
  basicEducationMatch: '',
  basicEducationSpecialty: '',
};

/** The stored academic columns a record carries — the diplomas as the list (`degreesOf`) */
export interface StoredAcademic {
  pedagogicalExperience: number | null;
  position: string | null;
  academicTitle: string | null;
  honoraryTitles: string[];
  adminPositions: string[];
  candidateDegree: string | null;
  candidateSpecialty: string | null;
  candidateDefenceDate: Date | null;
  candidateMatchesDepartment: boolean | null;
  doctorDegree: string | null;
  doctorSpecialty: string | null;
  doctorDefenceDate: Date | null;
  doctorMatchesDepartment: boolean | null;
  /** The list; absent on a row read without it, then the two slots stand in */
  degrees?: unknown;
  basicEducationMatch: boolean | null;
  basicEducationSpecialty: string | null;
}

export function academicToFormValues(staff: StoredAcademic): AcademicFormValues {
  const bool = (v: boolean | null) => (v === null ? '' : String(v));
  // `DateInput` reads and writes «YYYY-MM-DD»; the column holds UTC midnight.
  const listed = degreesOf(staff as unknown as Record<string, unknown>);
  const degreeRows: DegreeFormRow[] = listed.length
    ? listed.map((r) => ({
        degree: r.degree,
        specialty: r.specialty ?? '',
        defenceDate: r.defenceDate ?? '',
        matchesDepartment: bool(r.matchesDepartment),
      }))
    : [];
  return {
    pedagogicalExperience:
      staff.pedagogicalExperience != null ? String(staff.pedagogicalExperience) : '',
    position: staff.position ?? '',
    academicTitle: staff.academicTitle ?? '',
    honoraryTitles: [...staff.honoraryTitles],
    adminPositions: [...staff.adminPositions],
    degrees: degreeRows,
    basicEducationMatch: bool(staff.basicEducationMatch),
    basicEducationSpecialty: staff.basicEducationSpecialty ?? '',
  };
}
