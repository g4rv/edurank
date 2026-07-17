import { ACTIVITY_TYPES_2026 } from '@/lib/rating/activity-types';

// Client-safe half of the profile-derived feature: which Staff fields feed which
// rating indicators. The server-side sync lives in lib/rating/profile-derived.ts
// (do not import that one into client components — it reaches the database).

/** Staff columns the derived evidence is built from (per activity-type code) */
export const PROFILE_DERIVED_SOURCES = {
  pedagogical_experience: ['pedagogicalExperience'],
  academic_rank: ['academicRank'],
  scientific_degree: ['scientificDegree', 'degreeMatchesDepartment'],
  admin_position: ['adminPosition'],
  basic_education_match: ['basicEducationMatch', 'basicEducationSpecialty'],
  citations_wos: ['wosCitationCount'],
  citations_scopus: ['scopusCitationCount'],
  citations_scholar: ['googleScholarCitationCount'],
} as const satisfies Record<string, readonly ProfileDerivedStaffField[]>;

export type ProfileDerivedCode = keyof typeof PROFILE_DERIVED_SOURCES;
export const PROFILE_DERIVED_CODES = Object.keys(PROFILE_DERIVED_SOURCES) as ProfileDerivedCode[];

/** Every Staff field that feeds some derived indicator (drives tooltips + change detection) */
export type ProfileDerivedStaffField =
  | 'pedagogicalExperience'
  | 'academicRank'
  | 'scientificDegree'
  | 'degreeMatchesDepartment'
  | 'adminPosition'
  | 'basicEducationMatch'
  | 'basicEducationSpecialty'
  | 'wosCitationCount'
  | 'scopusCitationCount'
  | 'googleScholarCitationCount';

export const PROFILE_DERIVED_STAFF_FIELDS: readonly ProfileDerivedStaffField[] = [
  ...new Set(Object.values(PROFILE_DERIVED_SOURCES).flat()),
];

export interface RatingFieldHint {
  itemNumber: string;
  label: string;
  coefficientNote: string | null;
}

/** Staff field → the rating indicators it feeds (for the "affects rating" tooltip) */
export const RATING_FIELD_HINTS: Partial<Record<ProfileDerivedStaffField, RatingFieldHint[]>> =
  (() => {
    const hints: Partial<Record<ProfileDerivedStaffField, RatingFieldHint[]>> = {};
    for (const [code, fields] of Object.entries(PROFILE_DERIVED_SOURCES)) {
      const def = ACTIVITY_TYPES_2026.find((d) => d.code === code);
      if (!def) continue;
      for (const field of fields) {
        (hints[field] ??= []).push({
          itemNumber: def.itemNumber,
          label: def.label,
          coefficientNote: def.coefficientNote ?? null,
        });
      }
    }
    return hints;
  })();
