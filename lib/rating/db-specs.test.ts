import { describe, expect, it } from 'vitest';
import { catalogueType, dbSpecs } from './db-specs';
import { ACTIVITY_TYPES_2026 } from './activity-types';
import { EVIDENCE_FIELDS } from './evidence-fields';
import {
  evidenceFieldsSpecSchema,
  scoringSpecSchema,
  specProblems,
} from '@/validations/activity-type-spec';

// The DB-spec pipeline: catalogue def → { evidenceFields, scoring } JSON.
// Everything the seed writes must pass the same validation the admin builder
// will run — otherwise the builder could not round-trip a seeded indicator.

describe('dbSpecs over the whole 2026 catalogue', () => {
  it('converts every def without throwing (option points cover every option)', () => {
    const broken: string[] = [];
    for (const def of ACTIVITY_TYPES_2026) {
      try {
        dbSpecs(def);
      } catch {
        broken.push(def.code);
      }
    }
    expect(broken).toEqual([]);
  });

  it('every converted spec passes shape validation', () => {
    for (const def of ACTIVITY_TYPES_2026) {
      const { evidenceFields, scoring } = dbSpecs(def);
      const fieldsResult = evidenceFieldsSpecSchema.safeParse(evidenceFields);
      const scoringResult = scoringSpecSchema.safeParse(scoring);
      expect(
        fieldsResult.success,
        `${def.code}: ${JSON.stringify(fieldsResult.error?.issues)}`
      ).toBe(true);
      expect(scoringResult.success, def.code).toBe(true);
    }
  });

  it('every converted spec passes the scoring↔fields contract', () => {
    for (const def of ACTIVITY_TYPES_2026) {
      const { evidenceFields, scoring } = dbSpecs(def);
      expect(specProblems(evidenceFields, scoring), def.code).toEqual([]);
    }
  });

  it('embeds points into the scoring select', () => {
    const def = ACTIVITY_TYPES_2026.find((d) => d.code === 'publication_cat_a')!;
    const { evidenceFields } = dbSpecs(def);
    const select = evidenceFields.find((f) => f.kind === 'select' && f.name === 'option');
    expect(select?.kind).toBe('select');
    if (select?.kind === 'select') {
      expect(select.options.find((o) => o.value === 'q1')?.points).toBe(600);
    }
  });

  it('marks page-based codes and only them', () => {
    const pageBased = ACTIVITY_TYPES_2026.filter((d) => dbSpecs(d).scoring.pageBased);
    expect(pageBased.map((d) => d.code).sort()).toEqual([
      'edition_publication',
      'monograph_eu',
      'monograph_ua',
    ]);
  });

  it('itemNumber and maxPerYear survive the conversion', () => {
    const def = ACTIVITY_TYPES_2026.find((d) => d.maxPerYear !== undefined);
    expect(def).toBeDefined();
    const specs = dbSpecs(def!);
    expect(specs.maxPerYear).toBe(def!.maxPerYear);
    expect(specs.itemNumber).toBe(def!.itemNumber);
  });
});

describe('catalogueType', () => {
  it('returns a scorable type with a working evidence schema', () => {
    const type = catalogueType('publication_cat_a');
    expect(type.coefficient).toBe(1);
    expect(type.scoring.kind).toBe('SELECT');
    // The schema is generated from the same fields the engine scores
    expect(type.schema.safeParse({}).success).toBe(false);
  });

  it('every schema rejects an empty object when the type has a required field', () => {
    const withRequired = ACTIVITY_TYPES_2026.filter((t) =>
      (EVIDENCE_FIELDS[t.code] ?? []).some((f) => !('optional' in f && f.optional))
    );
    expect(withRequired.length).toBeGreaterThan(0);
    for (const def of withRequired) {
      expect(catalogueType(def.code).schema.safeParse({}).success, def.code).toBe(false);
    }
  });

  it('throws a named error for an unknown code', () => {
    expect(() => catalogueType('no_such_indicator')).toThrow(/no_such_indicator/);
  });
});
