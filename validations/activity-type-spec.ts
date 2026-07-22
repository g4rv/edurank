import { z } from 'zod';
import type { EvidenceField } from '@/lib/rating/evidence-fields';
import type { ScoringSpec } from '@/lib/rating/scoring';
import { schemaForFields } from './activity-evidence';

// Validates the JSON stored on ActivityType (`evidenceFields` + `scoring`).
// Two layers:
//   1. Shape — each field spec / the scoring spec is well-formed (Zod).
//   2. Contract — the field set actually supports the scoring rule
//      (`specProblems`), e.g. a SELECT rule has a select named `option` whose
//      every option carries points.
// Both run on admin input (the builder) and in tests over the 2026 catalogue.

/** Machine names are used as JSON keys and RHF paths — keep them strict */
const fieldName = z
  .string()
  .regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/, { error: 'Некоректна службова назва поля' });

const label = z.string().trim().min(1, { error: "Обов'язкове поле" }).max(500);

const common = { name: fieldName, label };

export const evidenceFieldSpecSchema: z.ZodType<EvidenceField> = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('text'),
    ...common,
    multiline: z.boolean().optional(),
    optional: z.boolean().optional(),
  }),
  z.strictObject({
    kind: z.literal('number'),
    ...common,
    min: z.number().optional(),
    int: z.boolean().optional(),
    optional: z.boolean().optional(),
  }),
  z.strictObject({
    kind: z.literal('url'),
    ...common,
    optional: z.boolean().optional(),
    hosts: z.array(z.string().min(1)).readonly().optional(),
    hostsError: z.string().max(500).optional(),
  }),
  z.strictObject({ kind: z.literal('date'), ...common, optional: z.boolean().optional() }),
  z.strictObject({ kind: z.literal('isbn'), ...common, optional: z.boolean().optional() }),
  z.strictObject({ kind: z.literal('doi'), ...common, optional: z.boolean().optional() }),
  z.strictObject({
    kind: z.literal('checkbox'),
    ...common,
    mustBeTrue: z.boolean().optional(),
    requiredError: z.string().max(500).optional(),
    group: z.string().max(200).optional(),
  }),
  z.strictObject({
    kind: z.literal('select'),
    ...common,
    options: z
      .array(
        z.strictObject({
          value: fieldName,
          label,
          points: z.number().min(0).optional(),
        })
      )
      .min(1, { error: 'Додайте хоча б один варіант' })
      .readonly(),
  }),
]) as z.ZodType<EvidenceField>;

export const evidenceFieldsSpecSchema = z.array(evidenceFieldSpecSchema);

export const scoringSpecSchema: z.ZodType<ScoringSpec> = z.strictObject({
  kind: z.enum(['FIXED', 'MULT', 'SELECT', 'SELECT_MULT', 'GATE']),
  pageBased: z.boolean().optional(),
});

export interface ParsedTypeSpecs {
  fields: EvidenceField[];
  scoring: ScoringSpec;
  /** Zod schema for this type's evidence, generated from the field specs */
  schema: z.ZodType<Record<string, unknown>>;
}

/**
 * Parses the JSON columns of an ActivityType row into typed specs plus the
 * evidence schema. Throws on malformed JSON — a row that went through the
 * builder or the seed always parses, so a throw means data corruption.
 */
export function parseTypeSpecs(row: {
  evidenceFields: unknown;
  scoring: unknown;
}): ParsedTypeSpecs {
  const fields = evidenceFieldsSpecSchema.parse(row.evidenceFields);
  const scoring = scoringSpecSchema.parse(row.scoring);
  return { fields, scoring, schema: schemaForFields(fields) };
}

// ─── What a scoring rule needs from the fields ───────────────────────────────

/**
 * Field names the rule reads. The builder creates these itself and stops the
 * admin removing or renaming them, so a saved rule can never point at a field
 * that is not there. Everything else on the form is evidence, not arithmetic.
 */
export function scoringFieldNames(scoring: ScoringSpec): string[] {
  const names: string[] = [];
  const pageBased = scoring.pageBased === true;
  if (pageBased) names.push('pages', 'coAuthors');

  switch (scoring.kind) {
    case 'FIXED':
      break;
    case 'MULT':
      if (!pageBased) names.push('value');
      break;
    case 'SELECT':
      names.push('option');
      break;
    case 'SELECT_MULT':
      names.push('option');
      if (!pageBased) names.push('credits');
      break;
    case 'GATE':
      names.push('mode');
      break;
  }
  return names;
}

const SCORING_FIELD_TEMPLATES: Record<string, EvidenceField> = {
  value: { kind: 'number', name: 'value', label: 'Значення', min: 0 },
  credits: { kind: 'number', name: 'credits', label: 'Кількість кредитів', min: 1 },
  pages: { kind: 'number', name: 'pages', label: 'Кількість сторінок', min: 1, int: true },
  coAuthors: {
    kind: 'number',
    name: 'coAuthors',
    label: 'Кількість співавторів',
    min: 1,
    int: true,
    optional: true,
  },
  option: {
    kind: 'select',
    name: 'option',
    label: 'Варіант',
    options: [{ value: 'option_1', label: 'Варіант 1', points: 0 }],
  },
  mode: {
    kind: 'select',
    name: 'mode',
    label: 'Вид роботи',
    options: [{ value: 'mode_1', label: 'Варіант 1', points: 0 }],
  },
};

/**
 * Fields reconciled with a (possibly just changed) scoring rule: the ones the
 * rule needs are kept or created in place, the ones a previous rule needed are
 * dropped, everything the admin added stays untouched and in order.
 */
export function withScoringFields(
  fields: readonly EvidenceField[],
  scoring: ScoringSpec
): EvidenceField[] {
  const needed = scoringFieldNames(scoring);
  const neededSet = new Set(needed);
  const everScoring = new Set(Object.keys(SCORING_FIELD_TEMPLATES));

  const kept = fields.filter((f) => neededSet.has(f.name) || !everScoring.has(f.name));
  const present = new Set(kept.map((f) => f.name));
  const added = needed.filter((n) => !present.has(n)).map((n) => SCORING_FIELD_TEMPLATES[n]);

  // Scoring fields lead the form — they are what the points come from
  return [...added, ...kept];
}

// ─── Layer 2: the cross-field contract ───────────────────────────────────────

type Found = { field: EvidenceField | undefined; problems: string[] };

function findRequired(
  fields: readonly EvidenceField[],
  kind: EvidenceField['kind'],
  name: string,
  what: string
): Found {
  const field = fields.find((f) => f.name === name);
  if (!field) return { field: undefined, problems: [`Правило потребує ${what} («${name}»)`] };
  if (field.kind !== kind) {
    return { field: undefined, problems: [`Поле «${name}» має бути типу «${kind}»`] };
  }
  if ('optional' in field && field.optional) {
    return { field, problems: [`Поле «${name}» не може бути необов'язковим`] };
  }
  return { field, problems: [] };
}

function requireScoredSelect(
  fields: readonly EvidenceField[],
  name: string,
  problems: string[]
): void {
  const found = findRequired(fields, 'select', name, 'список вибору з балами');
  problems.push(...found.problems);
  if (found.field?.kind === 'select') {
    const missing = found.field.options.filter((o) => o.points === undefined);
    if (missing.length > 0) {
      problems.push(
        `Кожен варіант поля «${name}» має мати бали (без балів: ${missing
          .map((o) => o.label)
          .join(', ')})`
      );
    }
  }
}

/**
 * Contract check between a field set and its scoring rule. Empty array = valid.
 * Field-name conventions (`option`, `value`, `pages`, `coAuthors`, `credits`,
 * `mode`) are the builder's job to create — this confirms they exist.
 */
export function specProblems(fields: readonly EvidenceField[], scoring: ScoringSpec): string[] {
  const problems: string[] = [];

  const names = fields.map((f) => f.name);
  const dupes = names.filter((n, i) => names.indexOf(n) !== i);
  if (dupes.length > 0) {
    problems.push(`Службові назви полів повторюються: ${[...new Set(dupes)].join(', ')}`);
  }

  if (scoring.pageBased && scoring.kind !== 'MULT' && scoring.kind !== 'SELECT_MULT') {
    problems.push('Розрахунок за друкованими аркушами можливий лише для правил з множенням');
  }

  const pageBased = scoring.pageBased === true;
  if (pageBased) {
    problems.push(...findRequired(fields, 'number', 'pages', 'числове поле сторінок').problems);
    // coAuthors is optional by design (absent = sole author), no check needed
  }

  switch (scoring.kind) {
    case 'FIXED':
      break;
    case 'MULT':
      if (!pageBased) {
        problems.push(...findRequired(fields, 'number', 'value', 'числове поле значення').problems);
      }
      break;
    case 'SELECT':
      requireScoredSelect(fields, 'option', problems);
      break;
    case 'SELECT_MULT':
      requireScoredSelect(fields, 'option', problems);
      if (!pageBased) {
        problems.push(
          ...findRequired(fields, 'number', 'credits', 'числове поле кількості').problems
        );
      }
      break;
    case 'GATE': {
      requireScoredSelect(fields, 'mode', problems);
      const gates = fields.filter((f) => f.kind === 'checkbox' && f.mustBeTrue);
      if (gates.length === 0) {
        problems.push("Правило «все або нічого» потребує хоча б одного обов'язкового чекбокса");
      }
      break;
    }
  }

  return problems;
}
