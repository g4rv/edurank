import { ACTIVITY_TYPES_2026 } from '../lib/rating/activity-types';
import { dbSpecs } from '../lib/rating/db-specs';
import type { EvidenceField } from '../lib/rating/evidence-fields';
import type { ScoringSpec } from '../lib/rating/scoring';
import { evidenceFieldsSpecSchema, specProblems } from '../validations/activity-type-spec';

// The pure half of `db:scientific-school-circle` — what one stored 3.17 row
// becomes. No database here, so it is tested on its own.
//
// Rating 3.17 «Керівництво науковою школою» was FIXED, 500 a record. It becomes
// a choice of two (owner, 2026-11-25): наукова школа (the row's own points —
// an admin may have changed the 500) or постійно діючий студентський науковий
// гурток / проблемна група (100, the catalogue's), plus an optional «Номер
// наказу». An admin's own wording of the label or the title box stays.

export const CODE = 'scientific_school';
export const SCHOOL = 'school';
const CIRCLE = 'circle';

/** The catalogue's words before this change — replaced only while still exactly these */
const OLD_LABEL = 'Керівництво науковою школою';
const OLD_TITLE_LABEL = 'Назва наукової школи';

export interface StoredType {
  label: string;
  coefficient: number;
  coefficientNote: string | null;
  evidenceFields: unknown;
  scoring: unknown;
}

export interface Conversion {
  label: string;
  coefficient: 1;
  coefficientNote: string;
  evidenceFields: EvidenceField[];
  scoring: ScoringSpec;
}

export type Plan =
  | { kind: 'done' }
  | { kind: 'unexpected'; reason: string }
  | { kind: 'convert'; schoolPoints: number; keptLabel: boolean; data: Conversion };

function catalogue() {
  const def = ACTIVITY_TYPES_2026.find((d) => d.code === CODE);
  if (!def) throw new Error(`${CODE}: not in the catalogue`);
  return { def, specs: dbSpecs(def) };
}

export function planConversion(row: StoredType): Plan {
  const parsed = evidenceFieldsSpecSchema.safeParse(row.evidenceFields);
  if (!parsed.success) return { kind: 'unexpected', reason: 'форма не читається' };
  const fields = parsed.data;
  if (fields.some((f) => f.name === 'option')) return { kind: 'done' };

  const scoringKind = (row.scoring as { kind?: unknown } | null)?.kind;
  if (scoringKind !== 'FIXED') {
    return { kind: 'unexpected', reason: `правило «${String(scoringKind)}», очікувалось FIXED` };
  }

  const { def, specs } = catalogue();
  const option = specs.evidenceFields.find((f) => f.name === 'option');
  const basis = specs.evidenceFields.find((f) => f.name === 'basis');
  const title = specs.evidenceFields.find((f) => f.name === 'title');
  if (option?.kind !== 'select' || !basis || !title) {
    throw new Error(`${CODE}: the catalogue has no option / title / basis field`);
  }

  const schoolPoints = row.coefficient;
  const circlePoints = option.options.find((o) => o.value === CIRCLE)?.points;
  if (circlePoints === undefined) throw new Error(`${CODE}: no points for ${CIRCLE}`);

  const choice: EvidenceField = {
    ...option,
    options: option.options.map((o) => (o.value === SCHOOL ? { ...o, points: schoolPoints } : o)),
  };
  const kept = fields.map((f) =>
    f.name === 'title' && f.label === OLD_TITLE_LABEL ? { ...f, label: title.label } : f
  );
  const evidenceFields = [
    choice,
    ...kept,
    ...(kept.some((f) => f.name === 'basis') ? [] : [basis]),
  ];
  const scoring: ScoringSpec = { kind: 'SELECT' };

  const problems = specProblems(evidenceFields, scoring);
  if (problems.length > 0) return { kind: 'unexpected', reason: problems.join('; ') };

  const keptLabel = row.label !== OLD_LABEL;
  return {
    kind: 'convert',
    schoolPoints,
    keptLabel,
    data: {
      label: keptLabel ? row.label : def.label,
      coefficient: 1,
      coefficientNote: `наукова школа — ${schoolPoints}, науковий гурток / проблемна група — ${circlePoints}`,
      evidenceFields,
      scoring,
    },
  };
}
