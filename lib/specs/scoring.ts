// Scoring engine — pure functions, no DB, no UI.
// score = computedValue × ActivityType.coefficient (user-confirmed model).
// For SELECT/SELECT_MULT/CHECK_SUM kinds the option points come from the type's own
// evidence field specs (`options[].points`), so the engine is fully driven by
// what the ActivityType row carries — no per-code knowledge (template editor v2).
//
// One Activity row = one item: repeatable achievements (each award, each
// curated group, each conference…) are submitted one at a time. Caps like
// «не більше 5» are enforced in the submit action by counting existing rows
// against `ActivityType.maxPerYear`.

import type { ActivityKind } from '@/lib/rating/activity-types';
import type { EvidenceField } from '@/lib/rating/evidence-fields';
import { round2 } from '@/lib/round';

export interface ScoreResult {
  computedValue: number;
  score: number;
}

/**
 * How one activity type's score is computed — the shape stored in
 * `ActivityType.scoring` (JSON). `pageBased` applies to MULT/SELECT_MULT and
 * switches the numeric part to the person's share of друковані аркуші: the
 * book's `sheets` / coAuthors, rounded to 0,1 (`personalSheets`).
 */
export interface ScoringSpec {
  kind: ActivityKind;
  pageBased?: boolean;
  /**
   * `pageBased` only: the least personal share, in аркуші, a save may claim —
   * 1,5 for a монографія (owner, 2026-10-16). A column value, not a code list,
   * so an indicator an admin builds can carry it too.
   */
  minShare?: number;
}

/** Everything the engine needs, selected straight off an ActivityType row */
export interface ScorableType {
  /** Only labels error messages */
  code: string;
  coefficient: number;
  scoring: ScoringSpec;
  evidenceFields: readonly EvidenceField[];
}

const SCORING_KINDS = new Set<string>([
  'FIXED',
  'MULT',
  'SELECT',
  'SELECT_MULT',
  'CHECK_SUM',
] satisfies ActivityKind[]);

function asRecord(evidence: unknown, code: string): Record<string, unknown> {
  if (typeof evidence !== 'object' || evidence === null || Array.isArray(evidence)) {
    throw new Error(`${code}: evidence must be an object`);
  }
  return evidence as Record<string, unknown>;
}

function requireNumber(
  value: unknown,
  field: string,
  code: string,
  { min }: { min: number }
): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min) {
    throw new Error(`${code}: "${field}" must be a number >= ${min}`);
  }
  return value;
}

/**
 * The floor a numeric evidence field accepts, as its own spec declares it.
 *
 * Hard-coding this made the rule un-configurable: `min` is part of a number
 * field's spec, an ADMIN sets it in /admin/rating, and SELECT_MULT ignored it
 * and demanded 1 regardless. It showed up importing 2025, where the same
 * `credits` field means a share of an author's sheet rather than кредити
 * стажування — 37 monograph and textbook rows carrying 0.5 or 0.083 др.а. were
 * refused by a rule about internships.
 *
 * The fallback keeps 2026 exactly as it was: `intl_internship` declares min 1,
 * so zero credits is still refused.
 */
function declaredMin(type: ScorableType, name: string, fallback: number): number {
  const field = type.evidenceFields.find((f) => f.kind === 'number' && f.name === name);
  return field?.kind === 'number' && typeof field.min === 'number' ? field.min : fallback;
}

/** Points of the chosen option of the select named `selectName` */
function optionPoints(type: ScorableType, selectName: string, evidence: unknown): number {
  const field = type.evidenceFields.find((f) => f.kind === 'select' && f.name === selectName);
  if (!field || field.kind !== 'select') {
    throw new Error(`${type.code}: no "${selectName}" select in the field specs`);
  }
  const chosen = asRecord(evidence, type.code)[selectName];
  const option = field.options.find((o) => o.value === chosen);
  if (!option) throw new Error(`${type.code}: unknown option "${String(chosen)}"`);
  if (option.points === undefined) {
    throw new Error(`${type.code}: option "${option.value}" has no points`);
  }
  return option.points;
}

/**
 * Pages in one друкований аркуш. Exported because the Характеристика's п.3 has
 * to measure the same thing the scoring does — «не менше 5 авторських аркушів»
 * is the licence's threshold over the figure computed here — and two copies of
 * 24 would drift the day the university changes it.
 */
export const PAGES_PER_AUTHOR_SHEET = 24;

/** A share of друковані аркуші counts to one decimal — «1,7», never «1,73» (owner, 2026-10-16) */
export function roundSheets(sheets: number): number {
  return Math.round((sheets + Number.EPSILON) * 10) / 10;
}

const positive = (v: unknown) => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * The whole book in друковані аркуші. Typed as `sheets` since 2026-10-16
 * (owner); a row saved before, and the Характеристика's typed п.3 row, carry
 * `pages` instead, which is pages / 24. Null when neither is a usable number.
 */
export function bookSheets(evidence: Record<string, unknown>): number | null {
  const sheets = positive(evidence.sheets);
  if (sheets !== null) return sheets;
  const pages = positive(evidence.pages);
  return pages === null ? null : pages / PAGES_PER_AUTHOR_SHEET;
}

/** This person's share: the book divided between its authors (none = sole), rounded to 0,1 */
export function personalSheets(evidence: Record<string, unknown>): number | null {
  const total = bookSheets(evidence);
  if (total === null) return null;
  const coAuthors = positive(evidence.coAuthors);
  return roundSheets(coAuthors !== null && coAuthors > 1 ? total / coAuthors : total);
}

/** The scored share — `personalSheets`, but a malformed row throws instead of scoring 0 */
function authorSheets(evidence: unknown, code: string): number {
  const e = asRecord(evidence, code);
  if (e.sheets !== undefined) requireNumber(e.sheets, 'sheets', code, { min: 0.1 });
  else requireNumber(e.pages, 'pages', code, { min: 1 });
  const coAuthors = e.coAuthors === undefined ? 1 : e.coAuthors;
  if (typeof coAuthors !== 'number' || !Number.isInteger(coAuthors) || coAuthors < 1) {
    throw new Error(`${code}: "coAuthors" must be an integer >= 1`);
  }
  return personalSheets(e) as number;
}

// Sum of the ticked checkboxes' own points, read from the column the chosen
// `mode` selects. The mode's option points are the maximum — the shares add up
// to it — and are resolved first so a malformed mode is rejected even when
// nothing is ticked and the sum would be 0 anyway.
//
// This replaced an all-or-nothing rule in which Moodle's six materials were
// mustBeTrue gates: an НПП who uploaded five of six scored nothing. Partial
// work now scores partially, which is what the university intended all along.
function checkSumValue(type: ScorableType, evidence: unknown): number {
  const max = optionPoints(type, 'mode', evidence);
  const e = asRecord(evidence, type.code);
  const mode = e.mode as string;

  const sum = type.evidenceFields.reduce(
    (total, f) =>
      f.kind === 'checkbox' && e[f.name] === true ? total + (f.points?.[mode] ?? 0) : total,
    0
  );

  // Cannot exceed the declared maximum. `specProblems` already refuses a spec
  // whose shares do not add up, so this only catches a row saved before that
  // guard existed — never silently pay more than the mode allows.
  return Math.min(sum, max);
}

function computeValue(type: ScorableType, evidence: unknown): number {
  const { kind, pageBased } = type.scoring;

  // `kind` arrives from a JSON column, so TypeScript's exhaustiveness proves
  // nothing about a row written by an older build. Without this an unknown kind
  // falls out of the switch as `undefined` and becomes a NaN score — a wrong
  // number that looks like a real one. GATE rows predating CHECK_SUM are exactly
  // that case; `pnpm db:gate-to-check-sum` converts them.
  if (!SCORING_KINDS.has(kind)) {
    throw new Error(`${type.code}: unknown scoring kind "${String(kind)}"`);
  }

  switch (kind) {
    case 'FIXED':
      return 1;
    case 'MULT':
      return pageBased
        ? authorSheets(evidence, type.code)
        : requireNumber(asRecord(evidence, type.code).value, 'value', type.code, { min: 0 });
    case 'SELECT':
      return optionPoints(type, 'option', evidence);
    case 'SELECT_MULT': {
      const points = optionPoints(type, 'option', evidence);
      const units = pageBased
        ? authorSheets(evidence, type.code)
        : requireNumber(asRecord(evidence, type.code).credits, 'credits', type.code, {
            min: declaredMin(type, 'credits', 1),
          });
      return points * units;
    }
    case 'CHECK_SUM':
      return checkSumValue(type, evidence);
  }
}

/**
 * Turn evidence into `{ computedValue, score }` for the given activity type
 * row. Throws on malformed specs or evidence — callers validate user input
 * with the generated Zod schema first.
 */
export function computeScore(type: ScorableType, evidence: unknown): ScoreResult {
  if (
    typeof type.coefficient !== 'number' ||
    !Number.isFinite(type.coefficient) ||
    type.coefficient < 0
  ) {
    throw new Error(`${type.code}: coefficient must be a non-negative number`);
  }
  const raw = computeValue(type, evidence);
  return { computedValue: round2(raw), score: round2(raw * type.coefficient) };
}
