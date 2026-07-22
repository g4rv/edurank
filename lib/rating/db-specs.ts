// Converts a 2026 catalogue def into the per-row JSON specs stored on
// `ActivityType` (`evidenceFields` + `scoring` columns, plus `itemNumber` and
// `maxPerYear`). Seed-side only: at runtime the DB row is the source of truth,
// the catalogue constants exist to (re)build it.
//
// The merge embeds option points into the select fields, so the DB spec is
// self-contained: SELECT_OPTION_POINTS / MOODLE_MODE_POINTS never need to be
// consulted for a row that came through here.

import { type ActivityTypeDef } from './activity-types';
import { EVIDENCE_FIELDS, type EvidenceField } from './evidence-fields';
import {
  MOODLE_MODE_POINTS,
  PAGE_BASED_CODES,
  SELECT_OPTION_POINTS,
  type ScoringSpec,
} from './scoring';

export interface ActivityTypeSpecs {
  itemNumber: string;
  maxPerYear: number | null;
  evidenceFields: EvidenceField[];
  scoring: ScoringSpec;
}

function withPoints(
  field: Extract<EvidenceField, { kind: 'select' }>,
  points: Record<string, number>,
  code: string
): EvidenceField {
  return {
    ...field,
    options: field.options.map((o) => {
      const p = points[o.value];
      if (p === undefined) throw new Error(`${code}: no points for option "${o.value}"`);
      return { ...o, points: p };
    }),
  };
}

/** The DB column values for one catalogue def; throws on catalogue drift */
export function dbSpecs(def: ActivityTypeDef): ActivityTypeSpecs {
  const fields = EVIDENCE_FIELDS[def.code];
  if (!fields) throw new Error(`${def.code}: no evidence fields defined`);

  const scoresBySelect =
    def.kind === 'SELECT' || def.kind === 'SELECT_MULT'
      ? {
          name: 'option',
          points: SELECT_OPTION_POINTS[def.code as keyof typeof SELECT_OPTION_POINTS],
        }
      : def.kind === 'GATE'
        ? { name: 'mode', points: MOODLE_MODE_POINTS }
        : null;
  if (scoresBySelect && !scoresBySelect.points) {
    throw new Error(`${def.code}: no option points defined`);
  }

  const evidenceFields = fields.map((f) =>
    scoresBySelect && f.kind === 'select' && f.name === scoresBySelect.name
      ? withPoints(f, scoresBySelect.points as Record<string, number>, def.code)
      : f
  );

  return {
    itemNumber: def.itemNumber,
    maxPerYear: def.maxPerYear ?? null,
    evidenceFields,
    scoring: {
      kind: def.kind,
      ...(PAGE_BASED_CODES.has(def.code) ? { pageBased: true } : {}),
    },
  };
}
