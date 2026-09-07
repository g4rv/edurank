import { USER_EDITABLE_STAFF_FIELDS } from '@/lib/staff/editable-fields';
import { FIELD_LABELS } from '@/lib/labels';

/**
 * What is still blank on somebody's profile.
 *
 * The old page printed «—» for every unfilled field, so a half-complete record
 * was a wall of dashes and told the reader nothing they could act on. This
 * turns the same information round: the filled fields are shown, and what is
 * missing is named once, at the end, as something to do.
 *
 * That matters more here than it looks. The hard part of this system was never
 * the scoring — it is getting ~200 НПП to fill anything in at all. A page that
 * says «ORCID і телефон не заповнено» does that work; a column of dashes does
 * not.
 *
 * ## The split is the point
 *
 * `own` are the fields a person may edit on their own profile — exactly
 * `USER_EDITABLE_STAFF_FIELDS`, read from the permission model rather than
 * retyped, so the two cannot drift. Those get an action.
 *
 * `administered` are filled by кадри or ННВ. Naming them is still useful — it
 * explains a gap somebody can see — but offering an НПП a button that leads to
 * a form which silently drops the field would be worse than saying nothing.
 */

interface CompletenessInput {
  isNpp: boolean;
  phone: string | null;
  orcidId: string | null;
  wosUrl: string | null;
  scopusUrl: string | null;
  googleScholarUrl: string | null;
  academicRank: unknown | null;
  scientificDegree: unknown | null;
  pedagogicalExperience: number | null;
  degreeDefenceDate: Date | null;
  basicEducationSpecialty: string | null;
  department: unknown | null;
  partTimeDepartments: unknown[];
}

export interface MissingFields {
  /** The person can fill these themselves at /profile/edit */
  own: string[];
  /** Filled by кадри or ННВ — named, but not actionable by the person */
  administered: string[];
}

/** Every field this checks, paired with the label a reader sees. */
const OWN_FIELDS = ['phone', 'orcidId', 'wosUrl', 'scopusUrl', 'googleScholarUrl'] as const;

function label(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

export function missingProfileFields(staff: CompletenessInput): MissingFields {
  const own: string[] = [];
  const administered: string[] = [];

  const blank = (v: unknown) => v === null || v === undefined || v === '';

  for (const field of OWN_FIELDS) {
    // Guard against the permission set and this list drifting apart: a field
    // listed here that a USER may NOT edit would be offered with an action that
    // cannot work.
    if (!USER_EDITABLE_STAFF_FIELDS.has(field)) continue;
    if (blank(staff[field])) own.push(label(field));
  }

  // Academic data belongs to НПП only — an administrative employee is not
  // missing a вчене звання, they simply do not have one.
  if (staff.isNpp) {
    if (blank(staff.academicRank)) administered.push(label('academicRank'));
    if (blank(staff.scientificDegree)) administered.push(label('scientificDegree'));
    if (blank(staff.pedagogicalExperience)) administered.push(label('pedagogicalExperience'));
    if (blank(staff.degreeDefenceDate)) administered.push(label('degreeDefenceDate'));
    if (blank(staff.basicEducationSpecialty)) administered.push(label('basicEducationSpecialty'));

    // An НПП attached to nothing is absent from every list, grid and Кнпп —
    // `validations/staff.ts` refuses it, so this only ever fires on legacy data.
    if (blank(staff.department) && staff.partTimeDepartments.length === 0) {
      administered.push('Кафедра');
    }
  }

  return { own, administered };
}

/** How much of what this person could reasonably fill actually is filled. */
export function profileCompleteness(staff: CompletenessInput): number {
  const missing = missingProfileFields(staff);
  const total = OWN_FIELDS.length + (staff.isNpp ? 6 : 0);
  const filled = total - missing.own.length - missing.administered.length;
  return total === 0 ? 100 : Math.round((filled / total) * 100);
}
