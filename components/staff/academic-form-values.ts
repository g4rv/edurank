/**
 * The academic form values as plain data (owner, 2026-10-06) — no 'use client',
 * because a SERVER page builds them (`/profile/edit`) and a server component
 * cannot call a function exported from a client module: Next turns it into a
 * reference and refuses the call at runtime. The cards that render them live in
 * academic-fields.tsx.
 */

import { degreesOf } from '@/lib/staff/academic';
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
  /** The list; absent on a row read without it, then the two slots stand in */
  degrees?: unknown;
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
 * What the popup refuses (owner, 2026-10-15): every field of a diploma is
 * mandatory except «відповідає кафедрі». Which ones depend on the kind — a level
 * for a basic education, a topic and an issue date for a degree.
 *
 * The popup only. The server accepts an entry without them, because rows saved
 * before this have none and refusing them would block an unrelated save — such a
 * card is flagged until somebody fills it in.
 */
export function diplomaProblems(row: DegreeFormRow): Partial<Record<keyof DegreeFormRow, string>> {
  const out: Partial<Record<keyof DegreeFormRow, string>> = {};
  if (!row.degree) out.degree = 'Оберіть тип освіти або ступінь';
  const basic = degreeLevel(row.degree) === 'basic';
  if (basic && !row.basicLevel) out.basicLevel = 'Оберіть рівень освіти';
  if (!row.specialty.trim()) out.specialty = 'Вкажіть спеціальність';
  if (!basic && !row.topic.trim()) out.topic = 'Вкажіть тему наукової роботи';
  if (!row.defenceDate) {
    out.defenceDate = basic ? 'Вкажіть дату видачі диплома' : 'Вкажіть дату захисту';
  }
  if (!basic && !row.issueDate) out.issueDate = 'Вкажіть дату видачі диплома';
  if (!row.issuedBy.trim()) out.issuedBy = 'Вкажіть, ким виданий диплом';
  if (!row.series.trim()) out.series = 'Вкажіть серію';
  if (!row.number.trim()) out.number = 'Вкажіть номер';
  return out;
}
