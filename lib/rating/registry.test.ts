import { describe, expect, it } from 'vitest';
import { activityTypeMeta, summarizeEvidence } from './registry';
import { ACTIVITY_TYPES_2026 } from './activity-types';
import { EVIDENCE_FIELDS } from './evidence-fields';

// activityTypeMeta joins three lists that are maintained separately:
// the catalogue, the form field specs, and the Zod schemas. When they drift,
// nothing breaks until an НПП presses submit — these tests move that failure
// to `pnpm test`. Relevant to the template-editor-v2 work, which moves the
// specs into the database.

describe('catalogue ↔ field specs ↔ schema stay in step', () => {
  it('every catalogue code resolves to a def, fields and a schema', () => {
    const broken: string[] = [];
    for (const def of ACTIVITY_TYPES_2026) {
      try {
        const meta = activityTypeMeta(def.code);
        if (!meta.def || !meta.fields || !meta.schema) broken.push(def.code);
      } catch {
        broken.push(def.code);
      }
    }
    expect(broken).toEqual([]);
  });

  it('has no field specs for codes the catalogue does not define', () => {
    const codes = new Set(ACTIVITY_TYPES_2026.map((t) => t.code));
    expect(Object.keys(EVIDENCE_FIELDS).filter((c) => !codes.has(c))).toEqual([]);
  });

  it('every schema actually rejects something, i.e. it is not a blank pass-through', () => {
    // A truly empty object should fail for any type that has a required field
    const withRequired = ACTIVITY_TYPES_2026.filter((t) =>
      (EVIDENCE_FIELDS[t.code] ?? []).some((f) => !('optional' in f && f.optional))
    );
    expect(withRequired.length).toBeGreaterThan(0);
    for (const def of withRequired) {
      expect(activityTypeMeta(def.code).schema.safeParse({}).success).toBe(false);
    }
  });

  it('throws a named error for an unknown code', () => {
    expect(() => activityTypeMeta('no_such_indicator')).toThrow(/no_such_indicator/);
  });
});

describe('summarizeEvidence', () => {
  it('renders a select using its label, not its stored value', () => {
    const line = summarizeEvidence('publication_cat_a', {
      option: 'q1',
      bibliography: 'Nature, 2026',
      link: 'https://doi.org/10.1000/x',
    });
    expect(line).toBe('Квартиль Q1 · Nature, 2026 · https://doi.org/10.1000/x');
  });

  it('falls back to the raw value when the option is unknown', () => {
    expect(summarizeEvidence('publication_cat_a', { option: 'q9' })).toBe('q9');
  });

  it('skips empty, null and undefined fields', () => {
    expect(
      summarizeEvidence('publication_cat_a', { option: 'q2', bibliography: '', link: null })
    ).toBe('Квартиль Q2');
  });

  it('shows a checkbox only when it is ticked', () => {
    const all = summarizeEvidence('moodle_course', {
      mode: 'development',
      workProgram: true,
      syllabus: false,
    });
    expect(all).toContain('Робоча програма');
    expect(all).not.toContain('Силабус');
  });

  it('labels numbers so a bare figure is never ambiguous', () => {
    expect(summarizeEvidence('monograph_ua', { pages: 48 })).toContain('48');
    expect(summarizeEvidence('monograph_ua', { pages: 48 })).toMatch(/:\s*48/);
  });

  it('returns an empty string for non-object evidence', () => {
    expect(summarizeEvidence('publication_cat_a', null)).toBe('');
    expect(summarizeEvidence('publication_cat_a', 'text')).toBe('');
    expect(summarizeEvidence('publication_cat_a', 42)).toBe('');
  });

  it('returns an empty string for a code with no field specs', () => {
    expect(summarizeEvidence('no_such_indicator', { a: 1 })).toBe('');
  });

  // Deliberate cap — it is a one-line summary, not the full record
  it('stops at five parts', () => {
    const line = summarizeEvidence('moodle_course', {
      mode: 'development',
      workProgram: true,
      syllabus: true,
      tests: true,
      lectureNotes: true,
      presentations: true,
      methodicalMaterials: true,
    });
    expect(line.split(' · ')).toHaveLength(5);
  });

  it('produces a usable line for every catalogue code without throwing', () => {
    for (const def of ACTIVITY_TYPES_2026) {
      expect(() => summarizeEvidence(def.code, { option: 'x', value: 1 })).not.toThrow();
    }
  });
});
