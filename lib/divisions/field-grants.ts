import { ACADEMIC_EDITABLE_FIELDS } from '@/lib/staff/editable-fields';

/**
 * Which Staff fields ADMIN may grant to a division — one list for the form that
 * shows them and the action that accepts them, so a checkbox can never be drawn
 * that the server then refuses. (It lived in `admin/permissions/field/actions.ts`
 * until the permission screens were folded into the division settings page.)
 *
 * NOT divisionId — it decides an editor's own permission scope, see
 * PERMISSION_SCOPING_STAFF_FIELDS. NOT employmentRate, passwordHash, role or
 * tokenVersion either; the action also runs every name through
 * `isEditorWritableField`, so this list drifting cannot open them.
 */
export const ALLOWED_FIELD_NAMES: ReadonlySet<string> = new Set([
  'lastName',
  'firstName',
  'patronymic',
  'email',
  'phone',
  'isNpp',
  // «Академічна інформація» and «Освіта» (2026-10-06). The old academicRank /
  // scientificDegree / degreeDefenceDate / adminPosition are derived mirrors now
  // and nobody's to grant.
  ...ACADEMIC_EDITABLE_FIELDS,
  'wosUrl',
  'wosCitationCount',
  'scopusUrl',
  'scopusCitationCount',
  'googleScholarUrl',
  'googleScholarCitationCount',
  'orcidId',
  'departmentId',
  // Сумісництво (owner, 2026-08-26): a join table, checked separately by
  // `updateStaff`. Placing somebody on a second кафедра is structure.
  'partTimeDepartmentIds',
]);

/** The groups the page draws, in order. */
export const FIELD_GROUPS = [
  {
    label: 'Персональні дані',
    fields: ['lastName', 'firstName', 'patronymic', 'email', 'phone', 'isNpp'],
  },
  {
    label: 'Академічна інформація',
    fields: [
      'position',
      'academicTitle',
      'honoraryTitles',
      'adminPositions',
      'pedagogicalExperience',
    ],
  },
  {
    label: 'Освіта',
    fields: ['degrees', 'englishCertificate', 'ukrainianCertificate'],
  },
  {
    label: 'Наукові профілі',
    fields: [
      'wosUrl',
      'wosCitationCount',
      'scopusUrl',
      'scopusCitationCount',
      'googleScholarUrl',
      'googleScholarCitationCount',
      'orcidId',
    ],
  },
  {
    label: 'Організаційне',
    fields: ['departmentId', 'partTimeDepartmentIds'],
  },
] as const;

export const ENTITY_ROWS = ['STAFF', 'DEPARTMENT', 'FACULTY'] as const;
export const ENTITY_ACTIONS = ['CREATE', 'UPDATE', 'DELETE'] as const;

export function entityKey(entity: string, action: string): string {
  return `${entity}:${action}`;
}
