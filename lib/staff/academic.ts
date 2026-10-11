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
  HONORARY_TITLES,
  anyDegreeName,
  degreeLevel,
  degreeName,
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
 * кафедри / керівник відділу 60, заступник декана / вчений секретар / відп.
 * секретар ПК 50, заступник завідувача 40, заст. відп. секретаря 30,
 * завідувач лабораторії / керівник центру 30.
 */
const ADMIN_POSITION_ORDER: readonly AdminPosition[] = [
  'VICE_RECTOR',
  'DEAN',
  'DEPARTMENT_HEAD',
  'UNIT_HEAD',
  'VICE_DEAN',
  'ACADEMIC_SECRETARY',
  'ADMISSION_SECRETARY',
  'DEPUTY_DEPARTMENT_HEAD',
  'DEPUTY_ADMISSION_SECRETARY',
  'LAB_HEAD',
  'CENTER_HEAD',
];

export interface AcademicFields {
  position: StaffPosition | null;
  academicTitle: AcademicTitle | null;
  candidateDegree: string | null;
  candidateDefenceDate: Date | null;
  candidateMatchesDepartment: boolean | null;
  doctorDegree: string | null;
  doctorDefenceDate: Date | null;
  doctorMatchesDepartment: boolean | null;
  adminPositions: readonly AdminPosition[];
}

export interface LegacyMirrors {
  academicRank: AcademicRank | null;
  scientificDegree: ScientificDegree | null;
  degreeDefenceDate: Date | null;
  degreeMatchesDepartment: boolean | null;
  adminPosition: AdminPosition | null;
}

/**
 * Rating 1.2's four values, by what they pay: професор 50, доцент 30, старший
 * викладач 15, викладач 10.
 */
const RANK_ORDER: readonly AcademicRank[] = ['PROFESSOR', 'DOCENT', 'SENIOR_LECTURER', 'LECTURER'];

/**
 * What rating 1.2 «Вчене звання» pays (owner, 2026-10-06): the вчене звання
 * професора or доцента, and where there is none, the посада — the order's own
 * list mixes the two (професор, доцент, старший викладач, викладач). So the
 * higher of the two. «Старший дослідник» is not on that list and pays nothing
 * by itself; the посада counts for such a person.
 */
export function ratingRank(
  position: StaffPosition | null,
  academicTitle: AcademicTitle | null
): AcademicRank | null {
  const held = new Set<AcademicRank>();
  // StaffPosition holds exactly AcademicRank's four values, by design.
  if (position) held.add(position as AcademicRank);
  if (academicTitle === 'DOCENT' || academicTitle === 'PROFESSOR') held.add(academicTitle);
  return RANK_ORDER.find((r) => held.has(r)) ?? null;
}

export function legacyMirrors(fields: AcademicFields): LegacyMirrors {
  const academicRank = ratingRank(fields.position, fields.academicTitle);

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

  // Rating 1.3's «за спеціальністю кафедри» is about the degree it pays for —
  // the highest one — so the old single answer is that degree's.
  const degreeMatchesDepartment = fields.doctorDegree
    ? fields.doctorMatchesDepartment
    : fields.candidateDegree
      ? fields.candidateMatchesDepartment
      : null;

  const adminPosition = ADMIN_POSITION_ORDER.find((p) => fields.adminPositions.includes(p)) ?? null;

  return {
    academicRank,
    scientificDegree,
    degreeDefenceDate,
    degreeMatchesDepartment,
    adminPosition,
  };
}

/**
 * Every post a person holds: the ones picked on the profile, and the headship a
 * кафедра or факультет gives them by naming them (`Department.headId`,
 * `Faculty.deanId`) — nobody picks that (owner, 2026-10-06). The ставки
 * «Статуси» column prices each of them and adds them up.
 */
export function heldAdminPositions({
  adminPositions,
  isHead,
  isDean,
}: {
  adminPositions: readonly AdminPosition[];
  isHead: boolean;
  isDean: boolean;
}): AdminPosition[] {
  const held = new Set<AdminPosition>(adminPositions);
  if (isHead) held.add('DEPARTMENT_HEAD');
  if (isDean) held.add('DEAN');
  return ADMIN_POSITION_ORDER.filter((p) => held.has(p));
}

/**
 * The ONE post rating 1.6 pays: the highest of the picked ones (`adminPosition`
 * is their mirror) and the headship. Never two.
 */
export function effectiveAdminPosition({
  adminPosition,
  isHead,
  isDean,
}: {
  adminPosition: AdminPosition | null;
  isHead: boolean;
  isDean: boolean;
}): AdminPosition | null {
  return (
    heldAdminPositions({
      adminPositions: adminPosition ? [adminPosition] : [],
      isHead,
      isDean,
    })[0] ?? null
  );
}

/**
 * The posts a person holds only ONE of (owner, 2026-10-06): проректор, декан,
 * завідувач кафедри, керівник відділу. The others sit beside one freely —
 * «завідувач кафедри та вчений секретар університету», as an НПП wrote.
 */
const LEADING_ADMIN_POSITIONS: ReadonlySet<AdminPosition> = new Set([
  'VICE_RECTOR',
  'DEAN',
  'DEPARTMENT_HEAD',
  'UNIT_HEAD',
]);

/** The post a кафедра or факультет gives a person by naming them */
export type HeadshipPost = 'DEPARTMENT_HEAD' | 'DEAN';

/** Which headship a person holds — a завідувач is never also a декан */
export function headshipOf(staff: {
  headOfDepartment: unknown;
  deanOfFaculty: unknown;
}): HeadshipPost | null {
  if (staff.deanOfFaculty) return 'DEAN';
  return staff.headOfDepartment ? 'DEPARTMENT_HEAD' : null;
}

export type AdminPostProblem = 'VICE_RECTOR_ALONE' | 'ONE_LEADING';

/**
 * Why this set of posts cannot be held together, or null.
 *
 * A проректор holds nothing else at all («if it's vice-rector — that's it»).
 * Anybody else holds at most one leading post, a headship counted. A «Декан»
 * picked before deans became automatic is the same post as the факультет's,
 * and is not counted twice.
 */
export function adminPostProblem(
  picked: readonly AdminPosition[],
  headship: HeadshipPost | null = null
): AdminPostProblem | null {
  const held = new Set(picked);
  if (headship) held.add(headship);
  if (held.has('VICE_RECTOR') && held.size > 1) return 'VICE_RECTOR_ALONE';
  const leading = [...held].filter((p) => LEADING_ADMIN_POSITIONS.has(p)).length;
  return leading > 1 ? 'ONE_LEADING' : null;
}

/** Made by a факультет or кафедра naming the person — never picked */
const AUTOMATIC_ADMIN_POSITIONS: ReadonlySet<AdminPosition> = new Set(['DEAN', 'DEPARTMENT_HEAD']);

/**
 * What the badge list may still offer: every post that would not break
 * `adminPostProblem`, and never «Декан» or «Завідувач кафедри».
 */
export function offeredAdminPositions(
  picked: readonly AdminPosition[],
  headship: HeadshipPost | null = null
): AdminPosition[] {
  return ADMIN_POSITION_ORDER.filter(
    (p) =>
      !AUTOMATIC_ADMIN_POSITIONS.has(p) &&
      !picked.includes(p) &&
      !adminPostProblem([...picked, p], headship)
  );
}

/**
 * One diploma in `Staff.degrees` (owner, 2026-10-10). The date is the calendar
 * day as «YYYY-MM-DD» — JSON has no date, and a day is all the Характеристика
 * and the rating read of it.
 */
export interface DegreeRecord {
  degree: string;
  specialty: string | null;
  defenceDate: string | null;
  matchesDepartment: boolean | null;
}

/** The six `candidate*` / `doctor*` columns, the mirrors of the list */
export interface DegreeColumns {
  candidateDegree: string | null;
  candidateSpecialty: string | null;
  candidateDefenceDate: Date | null;
  candidateMatchesDepartment: boolean | null;
  doctorDegree: string | null;
  doctorSpecialty: string | null;
  doctorDefenceDate: Date | null;
  doctorMatchesDepartment: boolean | null;
}

const day = (v: string | null): Date | null => (v ? new Date(`${v}T00:00:00.000Z`) : null);
const isoDay = (v: Date | null | undefined): string | null =>
  v instanceof Date && !Number.isNaN(v.getTime()) ? v.toISOString().slice(0, 10) : null;

/** The list as stored — defensive, because it is a JSON column */
export function asDegreeRecords(value: unknown): DegreeRecord[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const r = item as Record<string, unknown>;
    if (typeof r.degree !== 'string' || !r.degree) return [];
    return [
      {
        degree: r.degree,
        specialty: typeof r.specialty === 'string' && r.specialty ? r.specialty : null,
        defenceDate: typeof r.defenceDate === 'string' && r.defenceDate ? r.defenceDate : null,
        matchesDepartment: typeof r.matchesDepartment === 'boolean' ? r.matchesDepartment : null,
      },
    ];
  });
}

/**
 * A person's diplomas: the list, or — for a row written before the list existed
 * and not yet saved since (a seed, an import) — what the two old slots hold.
 */
export function degreesOf(row: Record<string, unknown> | null | undefined): DegreeRecord[] {
  const listed = asDegreeRecords(row?.degrees);
  if (listed.length > 0) return listed;
  const fromSlot = (prefix: 'doctor' | 'candidate'): DegreeRecord[] => {
    const degree = row?.[`${prefix}Degree`];
    if (typeof degree !== 'string' || !degree) return [];
    return [
      {
        degree,
        specialty: (row?.[`${prefix}Specialty`] as string | null | undefined) ?? null,
        defenceDate: isoDay(row?.[`${prefix}DefenceDate`] as Date | null | undefined),
        matchesDepartment:
          (row?.[`${prefix}MatchesDepartment`] as boolean | null | undefined) ?? null,
      },
    ];
  };
  return [...fromSlot('doctor'), ...fromSlot('candidate')];
}

/**
 * The record a level is judged by (owner, 2026-10-10): the one marked as
 * matching the кафедра first, otherwise the most recent defence. A record with no
 * date is the oldest there is; a full tie keeps the one listed first.
 */
export function bestDegree(records: readonly DegreeRecord[]): DegreeRecord | null {
  let best: DegreeRecord | null = null;
  for (const r of records) {
    if (!best) {
      best = r;
      continue;
    }
    const rMatch = r.matchesDepartment === true;
    const bMatch = best.matchesDepartment === true;
    if (rMatch !== bMatch) {
      if (rMatch) best = r;
      continue;
    }
    if ((r.defenceDate ?? '') > (best.defenceDate ?? '')) best = r;
  }
  return best;
}

/** The six mirror columns for a list: the best doctor-level and the best candidate-level record */
export function deriveDegreeColumns(records: readonly DegreeRecord[]): DegreeColumns {
  const doctor = bestDegree(records.filter((r) => degreeLevel(r.degree) === 'doctor'));
  const candidate = bestDegree(records.filter((r) => degreeLevel(r.degree) === 'candidate'));
  return {
    candidateDegree: candidate?.degree ?? null,
    candidateSpecialty: candidate?.specialty ?? null,
    candidateDefenceDate: day(candidate?.defenceDate ?? null),
    candidateMatchesDepartment: candidate?.matchesDepartment ?? null,
    doctorDegree: doctor?.degree ?? null,
    doctorSpecialty: doctor?.specialty ?? null,
    doctorDefenceDate: day(doctor?.defenceDate ?? null),
    doctorMatchesDepartment: doctor?.matchesDepartment ?? null,
  };
}

/** The most recent defence of ANY diploma — what Характеристика п.5 looks for */
function newestDefence(records: readonly DegreeRecord[]): Date | null {
  const days = records.map((r) => r.defenceDate).filter((d): d is string => !!d);
  return days.length ? day(days.reduce((a, b) => (b > a ? b : a))) : null;
}

/** The list as words for the audit log: «Доктор історичних наук · Історія · 12.05.2019 · відповідає кафедрі» */
function degreesAuditText(value: unknown): string | null {
  const records = asDegreeRecords(value);
  if (records.length === 0) return null;
  return records
    .map((r) =>
      [
        anyDegreeName(r.degree),
        r.specialty,
        r.defenceDate ? r.defenceDate.split('-').reverse().join('.') : null,
        r.matchesDepartment ? 'відповідає кафедрі' : null,
      ]
        .filter(Boolean)
        .join(' · ')
    )
    .join('; ');
}

/** The new fields the mirrors are derived from */
export const ACADEMIC_SOURCE_FIELDS = [
  'position',
  'academicTitle',
  'candidateDegree',
  'candidateDefenceDate',
  'candidateMatchesDepartment',
  'doctorDegree',
  'doctorDefenceDate',
  'doctorMatchesDepartment',
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
): (LegacyMirrors & Partial<DegreeColumns>) | null {
  const hasDegrees = 'degrees' in update;
  if (!hasDegrees && !ACADEMIC_SOURCE_FIELDS.some((key) => key in update)) return null;
  const merged = { ...stored } as Record<string, unknown>;
  for (const key of ACADEMIC_SOURCE_FIELDS) if (key in update) merged[key] = update[key];

  // The list is the source: its best records become the six columns, and the
  // old single defence date is the newest of ALL of them — a defence inside the
  // last five years is what п.5 asks, whichever diploma it was for.
  if (!hasDegrees) return legacyMirrors(merged as unknown as AcademicFields);
  const records = asDegreeRecords(update.degrees);
  const columns = deriveDegreeColumns(records);
  Object.assign(merged, columns);
  const mirrors = legacyMirrors(merged as unknown as AcademicFields);
  return { ...columns, ...mirrors, degreeDefenceDate: newestDefence(records) };
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
    case 'degrees':
      return degreesAuditText(value);
    case 'candidateDegree':
      return value ? degreeName('candidate', String(value)) : null;
    case 'doctorDegree':
      return value ? degreeName('doctor', String(value)) : null;
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
  candidateMatchesDepartment: true,
  doctorDegree: true,
  doctorSpecialty: true,
  doctorDefenceDate: true,
  doctorMatchesDepartment: true,
  degrees: true,
  basicEducationMatch: true,
  basicEducationSpecialty: true,
} as const;

/** The stored sources, or every one of them empty when there is no row */
export function storedAcademic(row: Record<string, unknown> | null | undefined): AcademicFields {
  return {
    position: (row?.position as StaffPosition | null | undefined) ?? null,
    academicTitle: (row?.academicTitle as AcademicTitle | null | undefined) ?? null,
    candidateDegree: (row?.candidateDegree as string | null | undefined) ?? null,
    candidateDefenceDate: (row?.candidateDefenceDate as Date | null | undefined) ?? null,
    candidateMatchesDepartment:
      (row?.candidateMatchesDepartment as boolean | null | undefined) ?? null,
    doctorDegree: (row?.doctorDegree as string | null | undefined) ?? null,
    doctorDefenceDate: (row?.doctorDefenceDate as Date | null | undefined) ?? null,
    doctorMatchesDepartment: (row?.doctorMatchesDepartment as boolean | null | undefined) ?? null,
    adminPositions: (row?.adminPositions as AdminPosition[] | undefined) ?? [],
  };
}
