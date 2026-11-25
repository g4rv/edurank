import { ENTITY_ACTION_LABELS, ENTITY_TYPE_LABELS, FIELD_LABELS } from '@/lib/labels';
import { ALLOWED_FIELD_NAMES, entityKey } from './field-grants';
import { forcedPages, type ForceReason, type PageKey } from './page-access';

/** Everything the settings page edits, as plain data. */
export interface DivisionSettings {
  name: string;
  canModerateRating: boolean;
  canOverseeScience: boolean;
  canViewQualifications: boolean;
  canInviteStaff: boolean;
  canSetPasswords: boolean;
  canEndSessions: boolean;
  /** The pages its editors open (owner, 2026-11-25) */
  canViewStaff: boolean;
  canViewDepartments: boolean;
  canViewFaculties: boolean;
  canViewRating: boolean;
  canViewCharts: boolean;
  /** «STAFF:CREATE» … sorted */
  entityPermissions: string[];
  /** Staff field names, sorted */
  fieldPermissions: string[];
}

export interface DivisionRow {
  name: string;
  canModerateRating: boolean;
  canOverseeScience: boolean;
  canViewQualifications: boolean;
  canInviteStaff: boolean;
  canSetPasswords: boolean;
  canEndSessions: boolean;
  canViewStaff: boolean;
  canViewDepartments: boolean;
  canViewFaculties: boolean;
  canViewRating: boolean;
  canViewCharts: boolean;
  entityPermissions: { entity: string; action: string }[];
  fieldPermissions: { fieldName: string }[];
}

export function toSettings(row: DivisionRow): DivisionSettings {
  return {
    name: row.name,
    canModerateRating: row.canModerateRating,
    canOverseeScience: row.canOverseeScience,
    canViewQualifications: row.canViewQualifications,
    canInviteStaff: row.canInviteStaff,
    canSetPasswords: row.canSetPasswords,
    canEndSessions: row.canEndSessions,
    canViewStaff: row.canViewStaff,
    canViewDepartments: row.canViewDepartments,
    canViewFaculties: row.canViewFaculties,
    canViewRating: row.canViewRating,
    canViewCharts: row.canViewCharts,
    entityPermissions: row.entityPermissions.map((p) => entityKey(p.entity, p.action)).sort(),
    // A name the page cannot draw (left over from before the 2026-10-06 academic
    // split) would ride in the form state and make every Save fail with
    // «Невідоме поле». Dropped here; the next Save replaces the set without it.
    fieldPermissions: row.fieldPermissions
      .map((p) => p.fieldName)
      .filter((n) => ALLOWED_FIELD_NAMES.has(n))
      .sort(),
  };
}

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);

/** «Did anything change?» — what enables the Save button. */
export function settingsEqual(a: DivisionSettings, b: DivisionSettings): boolean {
  return (
    a.name.trim() === b.name.trim() &&
    a.canModerateRating === b.canModerateRating &&
    a.canOverseeScience === b.canOverseeScience &&
    a.canViewQualifications === b.canViewQualifications &&
    a.canInviteStaff === b.canInviteStaff &&
    a.canSetPasswords === b.canSetPasswords &&
    a.canEndSessions === b.canEndSessions &&
    a.canViewStaff === b.canViewStaff &&
    a.canViewDepartments === b.canViewDepartments &&
    a.canViewFaculties === b.canViewFaculties &&
    a.canViewRating === b.canViewRating &&
    a.canViewCharts === b.canViewCharts &&
    sameSet(a.entityPermissions, b.entityPermissions) &&
    sameSet(a.fieldPermissions, b.fieldPermissions)
  );
}

/** One readable string for the audit log — `diffChanges` compares primitives. */
export function describeEntities(keys: readonly string[]): string {
  return keys
    .map((key) => {
      const [entity, action] = key.split(':');
      return `${ENTITY_TYPE_LABELS[entity] ?? entity} — ${ENTITY_ACTION_LABELS[action] ?? action}`;
    })
    .sort((x, y) => x.localeCompare(y, 'uk'))
    .join(', ');
}

export function describeFields(names: readonly string[]): string {
  return names
    .map((n) => FIELD_LABELS[n] ?? n)
    .sort((x, y) => x.localeCompare(y, 'uk'))
    .join(', ');
}

/**
 * The page switches this form's rights force on (owner, 2026-11-25), from the
 * values being edited — so ticking «Штат: Редагувати» locks «Штат» at once and
 * unticking it frees the switch. The same rule the server applies to the saved
 * division (`divisionPageAccess`).
 */
export function forcedPagesOfSettings(
  value: DivisionSettings
): Partial<Record<PageKey, ForceReason[]>> {
  const entityOf = (key: string) => key.split(':')[0];
  const entities = new Set(value.entityPermissions.map(entityOf));
  return forcedPages({
    staffEntity: entities.has('STAFF'),
    departmentEntity: entities.has('DEPARTMENT'),
    facultyEntity: entities.has('FACULTY'),
    fieldGrants: value.fieldPermissions.length > 0,
    accountSwitches: value.canInviteStaff || value.canSetPasswords || value.canEndSessions,
    canViewQualifications: value.canViewQualifications,
    canOverseeScience: value.canOverseeScience,
    canModerateRating: value.canModerateRating,
  });
}
