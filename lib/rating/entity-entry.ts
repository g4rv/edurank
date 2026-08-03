import type { EvidenceField } from './evidence-fields';

// Division-managed types where the natural workflow is entity-first:
// enter the object (project / council / program / journal) once, pick the
// staff involved (with a per-person role where the type has one), and fan
// out one Activity per person. The staff-first grid still works for these —
// this is the bulk path replacing the divisions' Дані *.xlsx working files.
//
// WHICH indicators offer it is a property of the row
// (`ActivityType.entityFirstEntry`, a checkbox in the template editor), not a
// list of codes: a code list left an admin-built indicator of exactly this
// shape stuck on the one-cell-at-a-time grid, and silently lost the bulk path
// if a code was ever renamed.

export interface EntityEntryMeta {
  // The object's own fields, entered once and copied to every staff Activity
  sharedFields: readonly EvidenceField[];
  // The per-person role select (`option`), when the type has one
  roleField: Extract<EvidenceField, { kind: 'select' }> | null;
}

export function entityEntryMeta(fields: readonly EvidenceField[]): EntityEntryMeta {
  const roleField = fields.find(
    (f): f is Extract<EvidenceField, { kind: 'select' }> =>
      f.kind === 'select' && f.name === 'option'
  );
  return {
    sharedFields: fields.filter((f) => f !== roleField),
    roleField: roleField ?? null,
  };
}
