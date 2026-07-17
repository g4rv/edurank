import { describe, expect, it } from 'vitest';
import { ACTIVITY_TYPES_2026 } from '@/lib/rating/activity-types';
import { EVIDENCE_FIELDS, type EvidenceField } from '@/lib/rating/evidence-fields';
import {
  computeScore,
  MOODLE_MATERIALS,
  MOODLE_MODE_POINTS,
  SELECT_OPTION_POINTS,
} from '@/lib/rating/scoring';
import { evidenceSchemaFor } from './activity-evidence';

/** Build a valid sample evidence object straight from the field specs */
function sampleEvidence(fields: readonly EvidenceField[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    switch (f.kind) {
      case 'text':
        out[f.name] = 'Тестове значення';
        break;
      case 'number':
        out[f.name] = Math.max(f.min ?? 0, 1);
        break;
      case 'url':
        out[f.name] = 'https://example.com/proof';
        break;
      case 'date':
        out[f.name] = '2026-06-15';
        break;
      case 'checkbox':
        out[f.name] = true;
        break;
      case 'select':
        out[f.name] = f.options[0].value;
        break;
    }
  }
  return out;
}

describe('catalogue ↔ evidence fields consistency', () => {
  it('every catalogue code has evidence fields, and no orphans exist', () => {
    const catalogueCodes = new Set(ACTIVITY_TYPES_2026.map((t) => t.code));
    for (const code of catalogueCodes) {
      expect(EVIDENCE_FIELDS, `missing evidence fields for ${code}`).toHaveProperty(code);
    }
    for (const code of Object.keys(EVIDENCE_FIELDS)) {
      expect(catalogueCodes.has(code), `orphan evidence fields: ${code}`).toBe(true);
    }
  });

  it('SELECT / SELECT_MULT option values exactly match SELECT_OPTION_POINTS keys', () => {
    for (const def of ACTIVITY_TYPES_2026) {
      if (def.kind !== 'SELECT' && def.kind !== 'SELECT_MULT') continue;
      const field = EVIDENCE_FIELDS[def.code].find(
        (f) => f.kind === 'select' && f.name === 'option'
      );
      expect(field, `${def.code}: no "option" select field`).toBeDefined();
      const values = (field as Extract<EvidenceField, { kind: 'select' }>).options
        .map((o) => o.value)
        .sort();
      const pointKeys = Object.keys(
        SELECT_OPTION_POINTS[def.code as keyof typeof SELECT_OPTION_POINTS]
      ).sort();
      expect(values, def.code).toEqual(pointKeys);
    }
  });

  it('scoring fields are present per kind (value / pages / credits / mode + materials)', () => {
    const names = (code: string) => EVIDENCE_FIELDS[code].map((f) => f.name);
    for (const def of ACTIVITY_TYPES_2026) {
      if (def.kind === 'MULT') {
        const n = names(def.code);
        expect(
          n.includes('value') || n.includes('pages'),
          `${def.code}: MULT needs value or pages`
        ).toBe(true);
      }
      if (def.code === 'intl_internship' || def.code === 'ukr_internship') {
        expect(names(def.code)).toContain('credits');
      }
      if (def.kind === 'GATE') {
        const n = names(def.code);
        expect(n).toContain('mode');
        for (const m of MOODLE_MATERIALS) expect(n, `moodle missing ${m}`).toContain(m);
      }
    }
  });
});

describe('schema → scoring integration (all 67 types)', () => {
  it('sample evidence parses and computes a score for every type', () => {
    for (const def of ACTIVITY_TYPES_2026) {
      const schema = evidenceSchemaFor(def.code);
      const parsed = schema.safeParse(sampleEvidence(EVIDENCE_FIELDS[def.code]));
      expect(parsed.success, `${def.code}: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);
      if (!parsed.success) continue;
      const { computedValue, score } = computeScore(def.code, parsed.data, def.coefficient);
      expect(Number.isFinite(computedValue), def.code).toBe(true);
      expect(Number.isFinite(score), def.code).toBe(true);
      expect(score, def.code).toBeGreaterThanOrEqual(0);
    }
  });

  it('moodle full sample scores mode points; unchecking one material gives 0', () => {
    const schema = evidenceSchemaFor('moodle_course');
    const full = schema.parse(sampleEvidence(EVIDENCE_FIELDS.moodle_course));
    expect(computeScore('moodle_course', full, 1).score).toBe(MOODLE_MODE_POINTS.development);

    const gated = schema.parse({ ...full, presentations: false });
    expect(computeScore('moodle_course', gated, 1).score).toBe(0);
  });
});

describe('schema validation behavior', () => {
  it('rejects missing required text', () => {
    const schema = evidenceSchemaFor('prof_associations');
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ title: '   ' }).success).toBe(false);
    expect(schema.safeParse({ title: 'Спілка економістів' }).success).toBe(true);
  });

  it('rejects an option outside the list', () => {
    const schema = evidenceSchemaFor('publication_cat_a');
    const ok = { option: 'q1', bibliography: 'Опис', link: 'https://doi.org/10.1/x' };
    expect(schema.safeParse(ok).success).toBe(true);
    expect(schema.safeParse({ ...ok, option: 'q5' }).success).toBe(false);
  });

  it('rejects unknown extra keys (strict)', () => {
    const schema = evidenceSchemaFor('prof_associations');
    expect(schema.safeParse({ title: 'Спілка', hacked: 1 }).success).toBe(false);
  });

  it('rejects bad url and bad date, accepts empty optional fields', () => {
    const schema = evidenceSchemaFor('conf_abroad');
    const base = { option: 'in_person', title: 'IEEE Conf' };
    expect(schema.safeParse(base).success).toBe(true);
    expect(schema.safeParse({ ...base, link: '' }).success).toBe(true);
    expect(schema.safeParse({ ...base, link: 'not-a-url' }).success).toBe(false);

    const patent = evidenceSchemaFor('patent_granted');
    const okPatent = { date: '2026-03-01', registrationNumber: '12345', title: 'Пристрій' };
    expect(patent.safeParse(okPatent).success).toBe(true);
    expect(patent.safeParse({ ...okPatent, date: '01.03.2026' }).success).toBe(false);
  });

  it('rejects dates with out-of-range years', () => {
    const patent = evidenceSchemaFor('patent_granted');
    const base = { registrationNumber: '12345', title: 'Пристрій' };
    const nextYear = new Date().getFullYear() + 1;
    expect(patent.safeParse({ ...base, date: '0002-03-01' }).success).toBe(false);
    expect(patent.safeParse({ ...base, date: '2300-03-01' }).success).toBe(false);
    expect(patent.safeParse({ ...base, date: '1949-12-31' }).success).toBe(false);
    expect(patent.safeParse({ ...base, date: `${nextYear}-12-31` }).success).toBe(true);
  });

  it('coerces numeric strings from form inputs', () => {
    const schema = evidenceSchemaFor('monograph_ua');
    const parsed = schema.parse({ pages: '120', coAuthors: '2', bibliography: 'Опис. ISBN 978…' });
    expect(parsed).toMatchObject({ pages: 120, coAuthors: 2 });
    expect(computeScore('monograph_ua', parsed, 200)).toEqual({ computedValue: 2.5, score: 500 });
  });

  it('mustBeTrue checkbox requires confirmation', () => {
    const schema = evidenceSchemaFor('basic_education_match');
    expect(schema.safeParse({ confirmed: false, specialty: 'Економіка' }).success).toBe(false);
    expect(schema.safeParse({ confirmed: true, specialty: 'Економіка' }).success).toBe(true);
  });

  it('throws on unknown code', () => {
    expect(() => evidenceSchemaFor('nope')).toThrow('No evidence fields');
  });
});
