/**
 * The academic form values as plain data (owner, 2026-10-06) — no 'use client',
 * because a SERVER page builds them (`/profile/edit`) and a server component
 * cannot call a function exported from a client module: Next turns it into a
 * reference and refuses the call at runtime. The cards that render them live in
 * academic-fields.tsx.
 */

import { degreesOf, diplomaGaps, type DiplomaField } from '@/lib/staff/academic';
import { degreeLevel } from '@/lib/staff/academic-options';

/** One diploma as its inputs hold it (owner, 2026-10-10) */
export type DegreeFormRow = {
  degree: string;
  specialty: string;
  defenceDate: string;
  matchesDepartment: string;
  /** The diploma itself (owner, 2026-10-15) */
  issuedBy: string;
  series: string;
  number: string;
  issueDate: string;
  basicLevel: string;
  topic: string;
};

/** A blank diploma — what «Додати освіту» starts the popup from */
export const EMPTY_DEGREE_ROW: DegreeFormRow = {
  degree: '',
  specialty: '',
  defenceDate: '',
  matchesDepartment: '',
  issuedBy: '',
  series: '',
  number: '',
  issueDate: '',
  basicLevel: '',
  topic: '',
};

/** Every academic field as the inputs produce it; Zod coerces on submit */
export type AcademicFormValues = {
  pedagogicalExperience: string;
  position: string;
  academicTitle: string;
  honoraryTitles: string[];
  adminPositions: string[];
  degrees: DegreeFormRow[];
};

export const EMPTY_ACADEMIC_VALUES: AcademicFormValues = {
  pedagogicalExperience: '',
  position: '',
  academicTitle: '',
  honoraryTitles: [],
  adminPositions: [],
  degrees: [],
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
  /** The `Diploma` rows; absent on a row read without them, then the two slots stand in */
  diplomas?: unknown;
  /** The two old basic-education columns — read only as a list entry (`degreesOf`) */
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
        issuedBy: r.issuedBy ?? '',
        series: r.series ?? '',
        number: r.number ?? '',
        issueDate: r.issueDate ?? '',
        basicLevel: r.basicLevel ?? '',
        topic: r.topic ?? '',
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
  };
}

/**
 * What the popup refuses (owner, 2026-10-15), as one message per field. The
 * rule itself is `diplomaGaps` — the same one the save checks, so the popup and
 * the server cannot disagree. Every field but «відповідає кафедрі» and the серія.
 */
export function diplomaProblems(row: DegreeFormRow): Partial<Record<DiplomaField, string>> {
  const basic = degreeLevel(row.degree) === 'basic';
  const missing: Record<DiplomaField, string> = {
    degree: 'Оберіть рівень освіти / науковий ступінь',
    basicLevel: 'Оберіть рівень освіти',
    specialty: 'Вкажіть спеціальність',
    topic: 'Вкажіть тему наукової роботи',
    defenceDate: basic ? 'Вкажіть дату видачі диплома' : 'Вкажіть дату захисту',
    issueDate: 'Вкажіть дату видачі диплома',
    issuedBy: 'Вкажіть, ким виданий диплом',
    number: 'Вкажіть номер',
  };
  const out: Partial<Record<DiplomaField, string>> = {};
  for (const [field, gap] of Object.entries(diplomaGaps(row)) as [DiplomaField, string][]) {
    out[field] =
      gap === 'beforeDefence' ? 'Диплом не може бути виданий раніше захисту' : missing[field];
  }
  return out;
}
