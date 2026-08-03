import type {
  AcademicRank,
  AdminPosition,
  Prisma,
  ScientificDegree,
} from '@/lib/generated/prisma/client';
import { db } from '@/lib/db';
import { computeScore } from '@/lib/rating/scoring';
import { parseTypeSpecs } from '@/validations/activity-type-spec';
import { recomputeRatingEntries, recomputeRatingEntry } from '@/lib/rating/recompute';
import {
  PROFILE_DERIVED_CODES,
  type ProfileDerivedCode,
} from '@/lib/rating/profile-derived-fields';

// Profile-derived indicators: rating activity types whose value comes from the
// Staff profile instead of manual entry (NPP submission or division panel).
// The profile is the single source of truth — the sync below upserts exactly ONE
// APPROVED activity per type (or removes it when the field is empty), so these
// items can never be duplicated or farmed.
//
// The sync itself is NOT audited per activity: the profile edit that triggered it
// is already in the audit log, and the derived rows are a computed consequence.

export {
  PROFILE_DERIVED_SOURCES,
  PROFILE_DERIVED_CODES,
  PROFILE_DERIVED_STAFF_FIELDS,
  type ProfileDerivedCode,
  type ProfileDerivedStaffField,
} from '@/lib/rating/profile-derived-fields';

interface DerivedStaff {
  isNpp: boolean;
  archivedAt: Date | null;
  pedagogicalExperience: number | null;
  academicRank: AcademicRank | null;
  scientificDegree: ScientificDegree | null;
  degreeMatchesDepartment: boolean | null;
  adminPosition: AdminPosition | null;
  basicEducationMatch: boolean | null;
  basicEducationSpecialty: string | null;
  wosCitationCount: number | null;
  scopusCitationCount: number | null;
  googleScholarCitationCount: number | null;
}

const DERIVED_STAFF_SELECT = {
  isNpp: true,
  archivedAt: true,
  pedagogicalExperience: true,
  academicRank: true,
  scientificDegree: true,
  degreeMatchesDepartment: true,
  adminPosition: true,
  basicEducationMatch: true,
  basicEducationSpecialty: true,
  wosCitationCount: true,
  scopusCitationCount: true,
  googleScholarCitationCount: true,
} satisfies Prisma.StaffSelect;

// Enum → evidence option keys (keys defined in lib/rating/evidence-fields.ts)
const RANK_OPTION: Record<AcademicRank, string> = {
  PROFESSOR: 'professor',
  DOCENT: 'docent',
  SENIOR_LECTURER: 'senior_lecturer',
  LECTURER: 'lecturer',
};

const POSITION_OPTION: Record<AdminPosition, string> = {
  VICE_RECTOR: 'vice_rector',
  DEAN: 'dean',
  VICE_DEAN_OR_SECRETARY: 'vice_dean_or_secretary',
  DEPARTMENT_OR_UNIT_HEAD: 'department_or_unit_head',
  DEPUTY_DEPARTMENT_HEAD: 'deputy_department_head',
  DEPUTY_ADMISSION_SECRETARY: 'deputy_admission_secretary',
  LAB_OR_CENTER_HEAD: 'lab_or_center_head',
};

function degreeOption(degree: ScientificDegree, matches: boolean | null): string {
  if (degree === 'DOCTOR') return matches ? 'doctor_dept_match' : 'doctor';
  return matches ? 'phd_dept_match' : 'phd';
}

/** Evidence for one derived type from the profile; null = the indicator does not apply */
export function derivedEvidence(
  code: ProfileDerivedCode,
  staff: DerivedStaff
): Record<string, unknown> | null {
  switch (code) {
    case 'pedagogical_experience':
      return staff.pedagogicalExperience && staff.pedagogicalExperience > 0
        ? { value: staff.pedagogicalExperience }
        : null;
    case 'academic_rank':
      return staff.academicRank ? { option: RANK_OPTION[staff.academicRank] } : null;
    case 'scientific_degree':
      return staff.scientificDegree
        ? { option: degreeOption(staff.scientificDegree, staff.degreeMatchesDepartment) }
        : null;
    case 'admin_position':
      return staff.adminPosition ? { option: POSITION_OPTION[staff.adminPosition] } : null;
    case 'basic_education_match':
      return staff.basicEducationMatch
        ? { confirmed: true, specialty: staff.basicEducationSpecialty ?? '' }
        : null;
    case 'citations_wos':
      return staff.wosCitationCount && staff.wosCitationCount > 0
        ? { value: staff.wosCitationCount }
        : null;
    case 'citations_scopus':
      return staff.scopusCitationCount && staff.scopusCitationCount > 0
        ? { value: staff.scopusCitationCount }
        : null;
    case 'citations_scholar':
      return staff.googleScholarCitationCount && staff.googleScholarCitationCount > 0
        ? { value: staff.googleScholarCitationCount }
        : null;
  }
}

interface DerivedType {
  id: string;
  code: string;
  coefficient: number;
  evidenceFields: unknown;
  scoring: unknown;
}

interface ExistingRow {
  id: string;
  evidence: unknown;
  score: number;
  submittedByRole: string;
}

interface SyncPlan {
  deleteIds: string[];
  updates: { id: string; evidence: Prisma.InputJsonValue; computedValue: number; score: number }[];
  creates: Prisma.ActivityCreateManyInput[];
}

function planIsEmpty(plan: SyncPlan): boolean {
  return plan.deleteIds.length === 0 && plan.updates.length === 0 && plan.creates.length === 0;
}

/**
 * Pure diff for ONE staff member: what has to change so that each derived type
 * has exactly one APPROVED SYSTEM row matching the profile. Shared by the
 * single-staff sync and the full backfill so the two can never drift apart.
 *
 * `rowsByType` must be ordered oldest-first — the oldest row is kept and
 * adopted, any others (pre-reclassification manual entries, farmed duplicates)
 * are purged.
 */
function planProfileDerived(
  staff: DerivedStaff,
  staffId: string,
  types: DerivedType[],
  rowsByType: Map<string, ExistingRow[]>,
  year: number
): SyncPlan {
  const plan: SyncPlan = { deleteIds: [], updates: [], creates: [] };

  for (const type of types) {
    const [existing, ...extras] = rowsByType.get(type.id) ?? [];
    plan.deleteIds.push(...extras.map((r) => r.id));

    // Archived people are off the roster: no derived rows, so the open year
    // stops counting them the moment they are archived — and refills when they
    // are restored. Their past years are untouched; this only ever writes to
    // the active OPEN template (see activeDerivedTypes).
    const countsThisYear = staff.isNpp && !staff.archivedAt;
    const evidence = countsThisYear
      ? derivedEvidence(type.code as ProfileDerivedCode, staff)
      : null;

    if (!evidence) {
      if (existing) plan.deleteIds.push(existing.id);
      continue;
    }

    const specs = parseTypeSpecs(type);
    const { computedValue, score } = computeScore(
      {
        code: type.code,
        coefficient: type.coefficient,
        scoring: specs.scoring,
        evidenceFields: specs.fields,
      },
      evidence
    );

    if (!existing) {
      plan.creates.push({
        staffId,
        activityTypeId: type.id,
        year,
        evidence: evidence as Prisma.InputJsonValue,
        computedValue,
        score,
        status: 'APPROVED',
        submittedByRole: 'SYSTEM',
        approvedAt: new Date(),
      });
      continue;
    }

    const unchanged =
      existing.score === score &&
      existing.submittedByRole === 'SYSTEM' &&
      JSON.stringify(existing.evidence) === JSON.stringify(evidence);
    if (unchanged) continue;

    plan.updates.push({
      id: existing.id,
      evidence: evidence as Prisma.InputJsonValue,
      computedValue,
      score,
    });
  }

  return plan;
}

/** Writes a plan out. Updates also adopt pre-reclassification rows as system-synced. */
async function applyPlan(tx: Prisma.TransactionClient, plan: SyncPlan): Promise<void> {
  if (plan.deleteIds.length > 0) {
    await tx.activity.deleteMany({ where: { id: { in: plan.deleteIds } } });
  }
  for (const row of plan.updates) {
    await tx.activity.update({
      where: { id: row.id },
      data: {
        evidence: row.evidence,
        computedValue: row.computedValue,
        score: row.score,
        status: 'APPROVED',
        submittedByRole: 'SYSTEM',
      },
    });
  }
  if (plan.creates.length > 0) {
    await tx.activity.createMany({ data: plan.creates });
  }
}

/** The derived types of the active OPEN year, or null when there is nothing to sync */
async function activeDerivedTypes(
  client: Pick<Prisma.TransactionClient, 'ratingTemplate'>
): Promise<{ year: number; types: DerivedType[] } | null> {
  const template = await client.ratingTemplate.findFirst({
    where: { isActive: true, status: 'OPEN' },
    select: {
      year: true,
      activityTypes: {
        where: {
          inputSource: 'PROFILE_DERIVED',
          isActive: true,
          code: { in: PROFILE_DERIVED_CODES },
        },
        select: { id: true, code: true, coefficient: true, evidenceFields: true, scoring: true },
      },
    },
  });
  if (!template || template.activityTypes.length === 0) return null;
  return { year: template.year, types: template.activityTypes };
}

/**
 * Syncs one staff member's profile-derived activities in the active OPEN year.
 * Exactly one APPROVED row per derived type: created/updated when the profile field
 * has a value, hard-deleted when it is empty or the staff is not (or no longer) НПП.
 * Recomputes the rating entry when anything changed. No-op when there is no active
 * open template. Closed years are never touched (their snapshot is authoritative).
 */
export async function syncProfileDerived(
  tx: Prisma.TransactionClient,
  staffId: string
): Promise<void> {
  const active = await activeDerivedTypes(tx);
  if (!active) return;

  const staff = await tx.staff.findUnique({
    where: { id: staffId },
    select: DERIVED_STAFF_SELECT,
  });
  if (!staff) return;

  const rows = await tx.activity.findMany({
    where: {
      staffId,
      activityTypeId: { in: active.types.map((t) => t.id) },
      status: { not: 'REMOVED' },
    },
    select: { id: true, activityTypeId: true, evidence: true, score: true, submittedByRole: true },
    orderBy: { createdAt: 'asc' },
  });

  const rowsByType = new Map<string, ExistingRow[]>();
  for (const row of rows) {
    const list = rowsByType.get(row.activityTypeId) ?? [];
    list.push(row);
    rowsByType.set(row.activityTypeId, list);
  }

  const plan = planProfileDerived(staff, staffId, active.types, rowsByType, active.year);
  if (planIsEmpty(plan)) return;

  await applyPlan(tx, plan);
  await recomputeRatingEntry(tx, staffId, active.year);
}

/**
 * Backfills profile-derived activities for every staff member — used when a year is
 * opened, reopened, activated, or when derived types are (re)introduced to a template.
 *
 * Reads the whole picture in four queries and writes one batched plan, instead of a
 * transaction per person: an admin triggers this from a server action and waits for
 * it, so ~300 staff × a query per derived type is not an acceptable page load.
 *
 * Returns how many staff actually changed.
 */
export async function backfillProfileDerived(): Promise<number> {
  const active = await activeDerivedTypes(db);
  if (!active) return 0;

  const typeIds = active.types.map((t) => t.id);
  const [staffList, rows] = await Promise.all([
    db.staff.findMany({ select: { id: true, ...DERIVED_STAFF_SELECT } }),
    db.activity.findMany({
      where: { activityTypeId: { in: typeIds }, status: { not: 'REMOVED' } },
      select: {
        id: true,
        staffId: true,
        activityTypeId: true,
        evidence: true,
        score: true,
        submittedByRole: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  const rowsByStaff = new Map<string, Map<string, ExistingRow[]>>();
  for (const row of rows) {
    const byType = rowsByStaff.get(row.staffId) ?? new Map<string, ExistingRow[]>();
    const list = byType.get(row.activityTypeId) ?? [];
    list.push(row);
    byType.set(row.activityTypeId, list);
    rowsByStaff.set(row.staffId, byType);
  }

  const combined: SyncPlan = { deleteIds: [], updates: [], creates: [] };
  const changedStaffIds: string[] = [];

  for (const staff of staffList) {
    const plan = planProfileDerived(
      staff,
      staff.id,
      active.types,
      rowsByStaff.get(staff.id) ?? new Map(),
      active.year
    );
    if (planIsEmpty(plan)) continue;

    combined.deleteIds.push(...plan.deleteIds);
    combined.updates.push(...plan.updates);
    combined.creates.push(...plan.creates);
    changedStaffIds.push(staff.id);
  }

  if (changedStaffIds.length === 0) return 0;

  await db.$transaction(
    async (tx) => {
      await applyPlan(tx, combined);
      await recomputeRatingEntries(tx, changedStaffIds, active.year);
    },
    // First run after activation touches every НПП at once
    { timeout: 120_000 }
  );

  return changedStaffIds.length;
}
