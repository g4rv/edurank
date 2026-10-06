import type {
  AcademicRank,
  AdminPosition,
  ScientificDegree,
  StaffPosition,
} from '@/lib/generated/prisma/client';

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
