import type {
  AcademicRank,
  AdminPosition,
  Prisma,
  ScientificDegree,
} from '@/lib/generated/prisma/client';
import { db } from '@/lib/db';
import { computeScore } from '@/lib/rating/scoring';
import { recomputeRatingEntry } from '@/lib/rating/recompute';
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
  const template = await tx.ratingTemplate.findFirst({
    where: { isActive: true, status: 'OPEN' },
    select: {
      year: true,
      activityTypes: {
        where: {
          inputSource: 'PROFILE_DERIVED',
          isActive: true,
          code: { in: PROFILE_DERIVED_CODES },
        },
        select: { id: true, code: true, coefficient: true },
      },
    },
  });
  if (!template || template.activityTypes.length === 0) return;

  const staff = await tx.staff.findUnique({
    where: { id: staffId },
    select: DERIVED_STAFF_SELECT,
  });
  if (!staff) return;

  let changed = false;

  for (const type of template.activityTypes) {
    // All non-removed rows of this type: the first becomes the synced row, any
    // extras (pre-reclassification manual entries, farmed duplicates) are purged.
    const rows = await tx.activity.findMany({
      where: { staffId, activityTypeId: type.id, status: { not: 'REMOVED' } },
      select: { id: true, evidence: true, score: true, submittedByRole: true },
      orderBy: { createdAt: 'asc' },
    });
    const [existing, ...extras] = rows;
    if (extras.length > 0) {
      await tx.activity.deleteMany({ where: { id: { in: extras.map((r) => r.id) } } });
      changed = true;
    }

    const evidence = staff.isNpp ? derivedEvidence(type.code as ProfileDerivedCode, staff) : null;

    if (!evidence) {
      if (existing) {
        await tx.activity.delete({ where: { id: existing.id } });
        changed = true;
      }
      continue;
    }

    const { computedValue, score } = computeScore(type.code, evidence, type.coefficient);

    if (existing) {
      const same =
        existing.score === score &&
        existing.submittedByRole === 'SYSTEM' &&
        JSON.stringify(existing.evidence) === JSON.stringify(evidence);
      if (same) continue;
      await tx.activity.update({
        where: { id: existing.id },
        data: {
          evidence: evidence as Prisma.InputJsonValue,
          computedValue,
          score,
          // Adopt pre-reclassification manual rows as system-synced ones
          status: 'APPROVED',
          submittedByRole: 'SYSTEM',
        },
      });
    } else {
      await tx.activity.create({
        data: {
          staffId,
          activityTypeId: type.id,
          year: template.year,
          evidence: evidence as Prisma.InputJsonValue,
          computedValue,
          score,
          status: 'APPROVED',
          submittedByRole: 'SYSTEM',
          approvedAt: new Date(),
        },
      });
    }
    changed = true;
  }

  if (changed) await recomputeRatingEntry(tx, staffId, template.year);
}

/**
 * Backfills profile-derived activities for every staff member — used when a year is
 * opened, reopened, activated, or when derived types are (re)introduced to a template.
 * One transaction per staff so a 300-person sweep never hits transaction timeouts.
 */
export async function backfillProfileDerived(): Promise<void> {
  const staffIds = await db.staff.findMany({ select: { id: true } });
  for (const { id } of staffIds) {
    await db.$transaction((tx) => syncProfileDerived(tx, id));
  }
}
