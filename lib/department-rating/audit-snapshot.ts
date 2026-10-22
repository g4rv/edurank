import type { DiffValue } from '@/lib/audit';
import type { DepartmentNarrative } from '@/validations/department-report';
import {
  DEVELOPMENT_BOXES,
  IMPACT_BOXES,
  IMPACT_KIND_LABEL,
  STUDY_BOXES,
} from './narrative-labels';
import type { IndicatorRow, ReportValues } from './score';

/** Item 14's boxes, short — their full wording carries the year */
const INITIATIVE_AUDIT = {
  topic: 'НДДКР',
  results: 'Результати',
  expected: 'Очікувані результати',
};

/**
 * A report flattened into readable keys for `diffChanges`, which takes
 * primitives only: «п. 1.1» → 2, «п. 3» → the chosen amount's label,
 * «п. 16 — Назва розробки, автори» → the text. Empty lines and boxes are left
 * out, so a save that changed nothing writes an empty diff.
 */
export function auditSnapshot(
  rows: IndicatorRow[],
  values: ReportValues,
  narrative: DepartmentNarrative,
  total: number
): Record<string, DiffValue> {
  const out: Record<string, DiffValue> = {};
  const put = (key: string, value: string | number | null | undefined) => {
    if (value === null || value === undefined || value === '') return;
    out[key] = value;
  };

  for (const row of rows) {
    const value = values[row.id];
    if (row.kind === 'COUNT') put(`п. ${row.itemNumber}`, value);
    if (row.kind === 'CHOICE' && value !== undefined) {
      put(`п. ${row.itemNumber}`, row.options[value]?.label ?? value);
    }
  }

  narrative.initiative.forEach((entry, i) => {
    for (const [key, label] of Object.entries(INITIATIVE_AUDIT)) {
      put(`п. 14.${i + 1} — ${label}`, entry[key as keyof typeof INITIATIVE_AUDIT]);
    }
  });
  narrative.studies.forEach((study, i) => {
    for (const box of STUDY_BOXES) put(`п. 15.${i + 1} — ${box.label}`, study[box.key]);
  });
  for (const box of DEVELOPMENT_BOXES) put(`п. 16 — ${box.label}`, narrative.development[box.key]);
  put(`п. 17 — ${IMPACT_KIND_LABEL}`, narrative.impact.kind);
  for (const box of IMPACT_BOXES) put(`п. 17 — ${box.label}`, narrative.impact[box.key]);

  out['Всього'] = total;
  return out;
}
