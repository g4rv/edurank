import { EVIDENCE_FIELDS, type EvidenceField } from './evidence-fields';

// Division-managed types where the natural workflow is entity-first:
// enter the object (project / council / program / journal) once, pick the
// staff involved (with a per-person role where the type has one), and fan
// out one Activity per person. The staff-first grid still works for these —
// this is the bulk path replacing the divisions' Дані *.xlsx working files.
export const ENTITY_FIRST_CODES: readonly string[] = [
  // ВМЗ — міжнародні проєкти
  'intl_grant_won',
  'intl_program_participation',
  'intl_grant_application',
  // ННВ — НДР-теми, конкурси, видання
  'ukr_grant_application',
  'ndr_execution',
  'journal_editorial_a',
  'journal_editorial_b',
  // ННЦЗЯО — освітні програми, плани, ради
  'accreditation_self_analysis',
  'edu_program_development',
  'edu_program_update',
  'curriculum_development',
  'curriculum_update',
  'accreditation_expert_meeting',
  'university_councils',
  'subject_committee',
  // ВА — спецради
  'specialized_council',
];

export interface EntityEntryMeta {
  // The object's own fields, entered once and copied to every staff Activity
  sharedFields: readonly EvidenceField[];
  // The per-person role select (`option`), when the type has one
  roleField: Extract<EvidenceField, { kind: 'select' }> | null;
}

export function entityEntryMeta(code: string): EntityEntryMeta {
  const fields = EVIDENCE_FIELDS[code] ?? [];
  const roleField = fields.find(
    (f): f is Extract<EvidenceField, { kind: 'select' }> =>
      f.kind === 'select' && f.name === 'option'
  );
  return {
    sharedFields: fields.filter((f) => f !== roleField),
    roleField: roleField ?? null,
  };
}
