// Registry: everything the UI needs to render one activity type,
// keyed by ActivityType.code.

import { evidenceSchemaFor } from '@/validations/activity-evidence';
import { ACTIVITY_TYPES_2026, type ActivityTypeDef } from './activity-types';
import { EVIDENCE_FIELDS, type EvidenceField } from './evidence-fields';

export interface ActivityTypeMeta {
  def: ActivityTypeDef;
  fields: readonly EvidenceField[];
  schema: ReturnType<typeof evidenceSchemaFor>;
}

const DEF_BY_CODE = new Map(ACTIVITY_TYPES_2026.map((t) => [t.code, t]));

/** Catalogue def + field specs + Zod schema for one code; throws on unknown code */
export function activityTypeMeta(code: string): ActivityTypeMeta {
  const def = DEF_BY_CODE.get(code);
  const fields = EVIDENCE_FIELDS[code];
  if (!def || !fields) throw new Error(`Unknown activity type code: ${code}`);
  return { def, fields, schema: evidenceSchemaFor(code) };
}

/**
 * Short human-readable line for lists and audit views,
 * e.g. «Квартиль Q1 · Nature 2026 · https://doi.org/…».
 */
export function summarizeEvidence(code: string, evidence: unknown): string {
  const fields = EVIDENCE_FIELDS[code] ?? [];
  if (typeof evidence !== 'object' || evidence === null) return '';
  const e = evidence as Record<string, unknown>;

  const parts: string[] = [];
  for (const f of fields) {
    const v = e[f.name];
    if (v === undefined || v === null || v === '') continue;
    switch (f.kind) {
      case 'select':
        parts.push(f.options.find((o) => o.value === v)?.label ?? String(v));
        break;
      case 'checkbox':
        if (v === true) parts.push(f.label);
        break;
      case 'number':
        parts.push(`${f.label}: ${v}`);
        break;
      case 'isbn':
        parts.push(`ISBN ${v}`);
        break;
      case 'doi':
        parts.push(`DOI ${v}`);
        break;
      case 'text':
      case 'url':
      case 'date':
        parts.push(String(v));
        break;
    }
  }
  return parts.slice(0, 5).join(' · ');
}
