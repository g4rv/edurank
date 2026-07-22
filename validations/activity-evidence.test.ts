import { describe, expect, it } from 'vitest';
import { ACTIVITY_TYPES_2026 } from '@/lib/rating/activity-types';
import { EVIDENCE_FIELDS, type EvidenceField } from '@/lib/rating/evidence-fields';
import { computeScore } from '@/lib/rating/scoring';
import { catalogueType, SELECT_OPTION_POINTS } from '@/lib/rating/db-specs';
import { schemaForFields } from './activity-evidence';

// Schemas are built from an activity type's own field specs. Here they are
// built from the catalogue through `catalogueType`, the same conversion the
// seed writes into the DB — so these tests still cover the real 2026 forms.
const schemaFor = (code: string) => catalogueType(code).schema;

/** Score a catalogue code, optionally overriding its coefficient */
function score(code: string, evidence: unknown, coefficient?: number) {
  const type = catalogueType(code);
  return computeScore(coefficient === undefined ? type : { ...type, coefficient }, evidence);
}

/** The mustBeTrue checkboxes of a gate type, off its own field specs */
const gateNames = (code: string) =>
  catalogueType(code)
    .evidenceFields.filter((f) => f.kind === 'checkbox' && f.mustBeTrue)
    .map((f) => f.name);

const MOODLE_MATERIALS = gateNames('moodle_course');

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
        // Host-restricted fields need a link on that service, not a placeholder
        out[f.name] = f.hosts ? `https://www.${f.hosts[0]}/record` : 'https://example.com/proof';
        break;
      case 'date':
        out[f.name] = '2026-06-15';
        break;
      case 'isbn':
        out[f.name] = '978-3-16-148410-0';
        break;
      case 'doi':
        out[f.name] = '10.1038/s41586-021-03819-2';
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
      const schema = schemaFor(def.code);
      const parsed = schema.safeParse(sampleEvidence(EVIDENCE_FIELDS[def.code]));
      expect(parsed.success, `${def.code}: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);
      if (!parsed.success) continue;
      const result = score(def.code, parsed.data);
      expect(Number.isFinite(result.computedValue), def.code).toBe(true);
      expect(Number.isFinite(result.score), def.code).toBe(true);
      expect(result.score, def.code).toBeGreaterThanOrEqual(0);
    }
  });

  // Item 5.1 is gated twice over: the schema refuses an incomplete course, and
  // the scoring engine still returns 0 for one — the second guard matters
  // because computeScore is also reachable from paths that skip the form.
  it('moodle full sample scores mode points', () => {
    const schema = schemaFor('moodle_course');
    const full = schema.parse(sampleEvidence(EVIDENCE_FIELDS.moodle_course));
    // «Розроблення» is the first mode option, which is what sampleEvidence picks
    expect(score('moodle_course', full).score).toBe(150);
  });

  it('moodle refuses a course missing any one material, rather than saving it as 0', () => {
    const schema = schemaFor('moodle_course');
    const full = sampleEvidence(EVIDENCE_FIELDS.moodle_course);

    for (const material of MOODLE_MATERIALS) {
      const result = schema.safeParse({ ...full, [material]: false });
      expect(result.success, material).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('всіх шести');
      }
    }
  });

  it('scoring still gates an incomplete course reaching it another way', () => {
    const full = schemaFor('moodle_course').parse(sampleEvidence(EVIDENCE_FIELDS.moodle_course));
    expect(score('moodle_course', { ...full, presentations: false }).score).toBe(0);
  });
});

describe('schema validation behavior', () => {
  it('rejects missing required text', () => {
    const schema = schemaFor('prof_associations');
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ title: '   ' }).success).toBe(false);
    expect(schema.safeParse({ title: 'Спілка економістів' }).success).toBe(true);
  });

  it('rejects an option outside the list', () => {
    const schema = schemaFor('publication_cat_a');
    const ok = {
      option: 'q1',
      bibliography: 'Опис',
      link: 'https://www.scopus.com/record/display.uri?eid=2-s2.0-1',
    };
    expect(schema.safeParse(ok).success).toBe(true);
    expect(schema.safeParse({ ...ok, option: 'q5' }).success).toBe(false);
  });

  it('rejects unknown extra keys (strict)', () => {
    const schema = schemaFor('prof_associations');
    expect(schema.safeParse({ title: 'Спілка', hacked: 1 }).success).toBe(false);
  });

  it('rejects bad url and bad date, accepts empty optional fields', () => {
    const schema = schemaFor('conf_abroad');
    const base = { option: 'in_person', title: 'IEEE Conf' };
    expect(schema.safeParse(base).success).toBe(true);
    expect(schema.safeParse({ ...base, link: '' }).success).toBe(true);
    expect(schema.safeParse({ ...base, link: 'not-a-url' }).success).toBe(false);

    const patent = schemaFor('patent_granted');
    const okPatent = { date: '2026-03-01', registrationNumber: '12345', title: 'Пристрій' };
    expect(patent.safeParse(okPatent).success).toBe(true);
    expect(patent.safeParse({ ...okPatent, date: '01.03.2026' }).success).toBe(false);
  });

  it('rejects dates with out-of-range years', () => {
    const patent = schemaFor('patent_granted');
    const base = { registrationNumber: '12345', title: 'Пристрій' };
    const nextYear = new Date().getFullYear() + 1;
    expect(patent.safeParse({ ...base, date: '0002-03-01' }).success).toBe(false);
    expect(patent.safeParse({ ...base, date: '2300-03-01' }).success).toBe(false);
    expect(patent.safeParse({ ...base, date: '1949-12-31' }).success).toBe(false);
    expect(patent.safeParse({ ...base, date: `${nextYear}-12-31` }).success).toBe(true);
  });

  it('coerces numeric strings from form inputs', () => {
    const schema = schemaFor('monograph_ua');
    const parsed = schema.parse({
      pages: '120',
      coAuthors: '2',
      isbn: '978-3-16-148410-0',
      bibliography: 'Опис',
    });
    expect(parsed).toMatchObject({ pages: 120, coAuthors: 2 });
    expect(score('monograph_ua', parsed, 200)).toEqual({ computedValue: 2.5, score: 500 });
  });

  it('rejects an ISBN whose check digit does not match', () => {
    const schema = schemaFor('monograph_ua');
    const base = { pages: 120, coAuthors: 2, bibliography: 'Опис' };

    expect(schema.safeParse({ ...base, isbn: '978-3-16-148410-0' }).success).toBe(true);
    expect(schema.safeParse({ ...base, isbn: '9783161484100' }).success).toBe(true);
    expect(schema.safeParse({ ...base, isbn: '0-8044-2957-X' }).success).toBe(true);

    expect(schema.safeParse({ ...base, isbn: '978-3-16-148410-1' }).success).toBe(false);
    expect(schema.safeParse({ ...base, isbn: 'немає' }).success).toBe(false);
    expect(schema.safeParse(base).success).toBe(false); // required on monograph_ua
  });

  it('leaves the ISBN optional on monograph_eu but still checks it when filled', () => {
    const schema = schemaFor('monograph_eu');
    const base = { pages: 200, coAuthors: 1, bibliography: 'Beschreibung' };

    expect(schema.safeParse(base).success).toBe(true);
    expect(schema.safeParse({ ...base, isbn: '' }).success).toBe(true);
    expect(schema.safeParse({ ...base, isbn: '978-3-16-148410-0' }).success).toBe(true);
    expect(schema.safeParse({ ...base, isbn: '978-3-16-148410-1' }).success).toBe(false);
  });

  it('accepts a DOI in any pasted form and stores it bare', () => {
    const schema = schemaFor('publication_cat_a');
    const base = {
      option: 'q1',
      bibliography: 'Опис',
      link: 'https://www.scopus.com/record/display.uri?eid=2-s2.0-123',
    };

    // The resolver prefix is stripped so the future checker can query it directly
    const parsed = schema.parse({ ...base, doi: 'https://doi.org/10.1038/abc123' });
    expect(parsed).toMatchObject({ doi: '10.1038/abc123' });

    expect(schema.safeParse({ ...base, doi: 'doi:10.1038/abc123' }).success).toBe(true);
    expect(schema.safeParse({ ...base, doi: '10.1038/abc123' }).success).toBe(true);
    expect(schema.safeParse({ ...base, doi: 'немає' }).success).toBe(false);
  });

  it('accepts a Scopus or WoS link but refuses any other site', () => {
    const schema = schemaFor('publication_cat_a');
    const base = { option: 'q1', bibliography: 'Опис' };
    const ok = (link: string) => schema.safeParse({ ...base, link }).success;

    // A Scopus link with no DOI to hand must still submit — the DOI is optional
    expect(ok('https://www.scopus.com/record/display.uri?eid=2-s2.0-1')).toBe(true);
    expect(ok('https://www.webofscience.com/wos/woscc/full-record/WOS:000123')).toBe(true);
    expect(ok('http://apps.webofknowledge.com/full_record.do?x=1')).toBe(true);
    expect(ok('www.scopus.com/record/display.uri?eid=1')).toBe(true); // pasted without protocol

    // The point: a valid URL is no longer enough
    expect(ok('https://example.com/paper.pdf')).toBe(false);
    expect(ok('https://drive.google.com/file/d/abc')).toBe(false);
    expect(ok('https://doi.org/10.1038/abc')).toBe(false); // the DOI has its own field
  });

  it('mustBeTrue checkbox requires confirmation', () => {
    const schema = schemaFor('basic_education_match');
    expect(schema.safeParse({ confirmed: false, specialty: 'Економіка' }).success).toBe(false);
    expect(schema.safeParse({ confirmed: true, specialty: 'Економіка' }).success).toBe(true);
  });

  it('builds a schema from an arbitrary field set, not from a code', () => {
    // What the admin builder relies on: fields the catalogue never defined
    const schema = schemaForFields([
      { kind: 'text', name: 'title', label: 'Назва' },
      { kind: 'number', name: 'count', label: 'Кількість', min: 1, int: true },
      { kind: 'text', name: 'note', label: 'Примітка', optional: true },
    ]);
    expect(schema.safeParse({ title: 'Журі', count: 2 }).success).toBe(true);
    expect(schema.safeParse({ title: '', count: 2 }).success).toBe(false);
    expect(schema.safeParse({ title: 'Журі', count: 0 }).success).toBe(false);
    expect(schema.safeParse({ title: 'Журі', count: 1.5 }).success).toBe(false);
    expect(schema.safeParse({ title: 'Журі', count: 2, extra: 1 }).success).toBe(false);
  });
});
