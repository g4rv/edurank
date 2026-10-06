import type {
  AcademicRank,
  AcademicTitle,
  AdminPosition,
  ScientificDegree,
  StaffPosition,
} from '@/lib/generated/prisma/client';
import type { DiffValue } from '@/lib/audit';
import { ACADEMIC_TITLE_LABELS, ADMIN_POSITION_LABELS, STAFF_POSITION_LABELS } from '@/lib/labels';
import {
  CANDIDATE_DEGREES,
  DOCTOR_DEGREES,
  HONORARY_TITLES,
  optionLabel,
} from '@/lib/staff/academic-options';

/**
 * The old academic columns, derived from the new ones (owner, 2026-10-06).
 *
 * `academicRank`, `scientificDegree`, `degreeDefenceDate` and `adminPosition`
 * are read by the rating (1.2, 1.3, 1.6), the Характеристика (п.5), the ставки
 * grid's status column and every staff list. Rather than move all of those in
 * one release, every save writes these mirrors from the new fields — so each
 * reader keeps getting exactly the value it always got, and no rating point can
 * move. A later release switches the readers over and drops the columns.
 */

/**
 * Rating 1.6 pays ONE administrative position — the highest (owner,
 * 2026-10-06). Ordered by what 1.6 pays: проректор 100, декан 80, завідувач
 * кафедри / керівник відділу 60, заступник декана / вчений секретар 50,
 * заступник завідувача 40, заст. відп. секретаря 30, завідувач лабораторії 30.
 */
const ADMIN_POSITION_ORDER: readonly AdminPosition[] = [
  'VICE_RECTOR',
  'DEAN',
  'DEPARTMENT_OR_UNIT_HEAD',
  'VICE_DEAN_OR_SECRETARY',
  'DEPUTY_DEPARTMENT_HEAD',
  'DEPUTY_ADMISSION_SECRETARY',
  'LAB_OR_CENTER_HEAD',
];

export interface AcademicFields {
  position: StaffPosition | null;
  candidateDegree: string | null;
  candidateDefenceDate: Date | null;
  doctorDegree: string | null;
  doctorDefenceDate: Date | null;
  adminPositions: readonly AdminPosition[];
}

export interface LegacyMirrors {
  academicRank: AcademicRank | null;
  scientificDegree: ScientificDegree | null;
  degreeDefenceDate: Date | null;
  adminPosition: AdminPosition | null;
}

export function legacyMirrors(fields: AcademicFields): LegacyMirrors {
  // StaffPosition holds exactly AcademicRank's four values, by design.
  const academicRank = fields.position as AcademicRank | null;

  const scientificDegree: ScientificDegree | null = fields.doctorDegree
    ? 'DOCTOR'
    : fields.candidateDegree
      ? 'CANDIDATE'
      : null;

  // The newer of the two — Характеристика п.5 asks for a defence inside the
  // last five years, and the newer date is the one that can answer it.
  const dates = [fields.candidateDefenceDate, fields.doctorDefenceDate].filter(
    (d): d is Date => d instanceof Date
  );
  const degreeDefenceDate = dates.length
    ? dates.reduce((a, b) => (b.getTime() > a.getTime() ? b : a))
    : null;

  const adminPosition = ADMIN_POSITION_ORDER.find((p) => fields.adminPositions.includes(p)) ?? null;

  return { academicRank, scientificDegree, degreeDefenceDate, adminPosition };
}

/** The new fields the mirrors are derived from */
export const ACADEMIC_SOURCE_FIELDS = [
  'position',
  'candidateDegree',
  'candidateDefenceDate',
  'doctorDegree',
  'doctorDefenceDate',
  'adminPositions',
] as const satisfies readonly (keyof AcademicFields)[];

/**
 * The mirrors for a save — or null when the save touches none of their
 * sources. A save may carry only some fields (an editor granted one of them),
 * so every source not in `update` is taken from what is stored.
 */
export function mirrorsForUpdate(
  stored: AcademicFields,
  update: Record<string, unknown>
): LegacyMirrors | null {
  if (!ACADEMIC_SOURCE_FIELDS.some((key) => key in update)) return null;
  const merged = { ...stored } as Record<string, unknown>;
  for (const key of ACADEMIC_SOURCE_FIELDS) if (key in update) merged[key] = update[key];
  return legacyMirrors(merged as unknown as AcademicFields);
}

/**
 * A value as the audit log should print it. Badge lists and degree keys are
 * stored as keys the reader cannot decode, and the audit diff takes no arrays,
 * so both become their labels, comma-joined; anything else passes through.
 */
export function academicAuditValue(key: string, value: unknown): DiffValue {
  // A missing list is an empty one — never a crash in the middle of a save.
  const many = (list: readonly string[] | null | undefined, label: (v: string) => string) =>
    list?.length ? list.map(label).join(', ') : null;
  switch (key) {
    case 'honoraryTitles':
      return many(value as string[], (v) => optionLabel(HONORARY_TITLES, v));
    case 'adminPositions':
      return many(value as AdminPosition[], (v) => ADMIN_POSITION_LABELS[v as AdminPosition] ?? v);
    case 'candidateDegree':
      return value ? optionLabel(CANDIDATE_DEGREES, String(value)) : null;
    case 'doctorDegree':
      return value ? optionLabel(DOCTOR_DEGREES, String(value)) : null;
    case 'position':
      return value ? STAFF_POSITION_LABELS[value as StaffPosition] : null;
    case 'academicTitle':
      return value ? ACADEMIC_TITLE_LABELS[value as AcademicTitle] : null;
    default:
      return value as DiffValue;
  }
}

/**
 * The stored academic values a save needs: the before-side of the audit diff,
 * and the sources `mirrorsForUpdate` merges a partial save with.
 */
export const ACADEMIC_STORED_SELECT = {
  pedagogicalExperience: true,
  position: true,
  academicTitle: true,
  honoraryTitles: true,
  adminPositions: true,
  candidateDegree: true,
  candidateSpecialty: true,
  candidateDefenceDate: true,
  doctorDegree: true,
  doctorSpecialty: true,
  doctorDefenceDate: true,
  degreeMatchesDepartment: true,
  basicEducationMatch: true,
  basicEducationSpecialty: true,
} as const;

/** The stored sources, or every one of them empty when there is no row */
export function storedAcademic(row: Record<string, unknown> | null | undefined): AcademicFields {
  return {
    position: (row?.position as StaffPosition | null | undefined) ?? null,
    candidateDegree: (row?.candidateDegree as string | null | undefined) ?? null,
    candidateDefenceDate: (row?.candidateDefenceDate as Date | null | undefined) ?? null,
    doctorDegree: (row?.doctorDegree as string | null | undefined) ?? null,
    doctorDefenceDate: (row?.doctorDefenceDate as Date | null | undefined) ?? null,
    adminPositions: (row?.adminPositions as AdminPosition[] | undefined) ?? [],
  };
}
