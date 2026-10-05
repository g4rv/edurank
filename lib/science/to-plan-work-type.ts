import type { ScienceWorkTypeRow } from '@/lib/queries/get-science-template';
import type { PlanWorkType } from '@/components/science/add-plan-row-dialog';
import { evidenceFieldsSpecSchema, scoringSpecSchema } from '@/validations/activity-type-spec';

/**
 * A catalogue row as the science screens want it. Field specs come off the
 * row's JSON; a malformed row degrades to an empty form — the same defensive
 * shape `achievements/[section]/page.tsx` uses for the rating.
 *
 * Shared by the НПП's own `/science-plan` and the record tab
 * `/staff/[id]/science`.
 */
export function toPlanWorkType(row: ScienceWorkTypeRow): PlanWorkType {
  const fields = evidenceFieldsSpecSchema.safeParse(row.evidenceFields);
  const scoring = scoringSpecSchema.safeParse(row.scoring);
  return {
    id: row.id,
    code: row.code,
    label: row.label,
    itemNumber: row.itemNumber,
    itemTitle: row.itemTitle,
    shortLabel: row.shortLabel,
    coefficient: row.coefficient,
    unitNote: row.unitNote,
    reportingForm: row.reportingForm,
    fields: fields.success ? fields.data : [],
    scoring: scoring.success ? scoring.data : { kind: 'FIXED' },
    sharing: row.sharing,
    linkRule: row.linkRule,
    fileRule: row.fileRule,
  };
}
