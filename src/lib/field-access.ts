import type { Role } from '@/generated/prisma/client';

// Fields a USER (professor) can edit on their own profile
export const USER_EDITABLE_FIELDS = [
  'email',
  'wosURL',
  'scopusURL',
  'googleScholarURL',
  'orcidId',
] as const;

// Hard-coded division → editable fields map.
// Each division owns specific slices of professor data.
export const DIVISION_EDITABLE_FIELDS: Record<string, string[]> = {
  'Навчально-науковий відділ': [
    'academicRank',
    'academicPosition',
    'scientificDegree',
    'degreeMatchesDepartment',
    'employmentRate',
    'pedagogicalExperience',
    'ratingSheetId',
    'certificateId',
    'wosCitationCount',
    'scopusCitationCount',
    'googleScholarCitationCount',
  ],
};

export type EditableFields = string[] | 'all';

export function getEditableFields(
  role: Role,
  divisionName?: string | null
): EditableFields {
  if (role === 'ADMIN') return 'all';
  if (role === 'USER') return [...USER_EDITABLE_FIELDS];
  if (role === 'EDITOR' && divisionName) {
    return DIVISION_EDITABLE_FIELDS[divisionName] ?? [];
  }
  return [];
}

export function canEdit(field: string, editableFields: EditableFields): boolean {
  if (editableFields === 'all') return true;
  return editableFields.includes(field);
}
