import { describe, expect, it } from 'vitest';
import { ACTIVITY_TYPES_2026 } from './activity-types';
import {
  computeScore,
  MOODLE_MATERIALS,
  MOODLE_MODE_POINTS,
  SELECT_OPTION_POINTS,
} from './scoring';

const defsByKind = (kind: string) => ACTIVITY_TYPES_2026.filter((t) => t.kind === kind);

function allMoodleMaterials(present = true): Record<string, boolean> {
  return Object.fromEntries(MOODLE_MATERIALS.map((m) => [m, present]));
}

describe('catalogue ↔ scoring consistency', () => {
  it('every SELECT / SELECT_MULT code has an option points map', () => {
    for (const def of [...defsByKind('SELECT'), ...defsByKind('SELECT_MULT')]) {
      expect(SELECT_OPTION_POINTS, `missing options for ${def.code}`).toHaveProperty(def.code);
    }
  });

  it('every option map belongs to a SELECT / SELECT_MULT catalogue code', () => {
    const selectCodes = new Set(
      [...defsByKind('SELECT'), ...defsByKind('SELECT_MULT')].map((t) => t.code)
    );
    for (const code of Object.keys(SELECT_OPTION_POINTS)) {
      expect(selectCodes.has(code), `orphan option map: ${code}`).toBe(true);
    }
  });

  it('SELECT / SELECT_MULT / GATE types have coefficient 1 in 2026', () => {
    for (const def of ACTIVITY_TYPES_2026) {
      if (def.kind === 'SELECT' || def.kind === 'SELECT_MULT' || def.kind === 'GATE') {
        expect(def.coefficient, def.code).toBe(1);
      }
    }
  });
});

describe('FIXED types', () => {
  it('every FIXED type scores exactly its coefficient (computedValue = 1)', () => {
    for (const def of defsByKind('FIXED')) {
      expect(computeScore(def.code, {}, def.coefficient), def.code).toEqual({
        computedValue: 1,
        score: def.coefficient,
      });
    }
  });
});

describe('SELECT types', () => {
  it('every option of every SELECT type returns its points', () => {
    for (const def of defsByKind('SELECT')) {
      const options = SELECT_OPTION_POINTS[def.code as keyof typeof SELECT_OPTION_POINTS];
      for (const [option, points] of Object.entries(options)) {
        expect(computeScore(def.code, { option }, 1), `${def.code}.${option}`).toEqual({
          computedValue: points,
          score: points,
        });
      }
    }
  });

  it('publication_cat_a quartiles: Q1=600, Q2=500, Q3-4/none=400', () => {
    expect(computeScore('publication_cat_a', { option: 'q1' }, 1).score).toBe(600);
    expect(computeScore('publication_cat_a', { option: 'q2' }, 1).score).toBe(500);
    expect(computeScore('publication_cat_a', { option: 'q3_4_or_none' }, 1).score).toBe(400);
  });

  it('coefficient scales option points (admin can rescale a whole item)', () => {
    expect(computeScore('publication_cat_a', { option: 'q1' }, 2).score).toBe(1200);
    expect(computeScore('publication_cat_a', { option: 'q1' }, 0).score).toBe(0);
  });

  it('rejects unknown option', () => {
    expect(() => computeScore('academic_rank', { option: 'rector' }, 1)).toThrow('unknown option');
    expect(() => computeScore('academic_rank', {}, 1)).toThrow('unknown option');
  });
});

describe('MULT types (value × coefficient)', () => {
  it('pedagogical experience: 1 point per year', () => {
    expect(computeScore('pedagogical_experience', { value: 24 }, 1)).toEqual({
      computedValue: 24,
      score: 24,
    });
  });

  it('teaching load: entered points × 1', () => {
    expect(computeScore('teaching_load', { value: 87 }, 1).score).toBe(87);
  });

  it('citations: h-index × per-base points', () => {
    expect(computeScore('citations_wos', { value: 5 }, 100).score).toBe(500);
    expect(computeScore('citations_scholar', { value: 7 }, 10).score).toBe(70);
    expect(computeScore('citations_scopus', { value: 0 }, 100).score).toBe(0);
  });

  it('rejects missing or negative value', () => {
    expect(() => computeScore('pedagogical_experience', {}, 1)).toThrow('"value"');
    expect(() => computeScore('citations_wos', { value: -1 }, 100)).toThrow('"value"');
  });
});

describe('monographs (author sheets: pages / 24 / coAuthors)', () => {
  it('ukrainian monograph: 120 pages, 2 co-authors, ×200', () => {
    expect(computeScore('monograph_ua', { pages: 120, coAuthors: 2 }, 200)).toEqual({
      computedValue: 2.5,
      score: 500,
    });
  });

  it('EU-language monograph: sole author by default, ×300', () => {
    expect(computeScore('monograph_eu', { pages: 48 }, 300)).toEqual({
      computedValue: 2,
      score: 600,
    });
  });

  it('rounds to 2 decimals without double-rounding the score', () => {
    // 100 / 24 = 4.1666… → computedValue 4.17, score = raw × 200 = 833.33
    expect(computeScore('monograph_ua', { pages: 100 }, 200)).toEqual({
      computedValue: 4.17,
      score: 833.33,
    });
  });

  it('rejects zero pages and invalid coAuthors', () => {
    expect(() => computeScore('monograph_ua', { pages: 0 }, 200)).toThrow('"pages"');
    expect(() => computeScore('monograph_ua', { pages: 24, coAuthors: 0 }, 200)).toThrow(
      '"coAuthors"'
    );
    expect(() => computeScore('monograph_ua', { pages: 24, coAuthors: 1.5 }, 200)).toThrow(
      '"coAuthors"'
    );
  });
});

describe('SELECT_MULT types', () => {
  it('editions: type points × author sheets', () => {
    // textbook: 200 × (240/24)/3 = 666.67
    expect(
      computeScore('edition_publication', { option: 'textbook', pages: 240, coAuthors: 3 }, 1)
    ).toEqual({ computedValue: 666.67, score: 666.67 });
    // recommendations: 80 × (24/24)/1 = 80
    expect(
      computeScore('edition_publication', { option: 'recommendations', pages: 24 }, 1).score
    ).toBe(80);
  });

  it('internships: per-credit points × credits', () => {
    expect(computeScore('intl_internship', { option: 'in_person', credits: 3 }, 1).score).toBe(300);
    expect(computeScore('intl_internship', { option: 'remote', credits: 2 }, 1).score).toBe(40);
    expect(computeScore('ukr_internship', { option: 'in_person', credits: 2 }, 1).score).toBe(100);
    expect(computeScore('ukr_internship', { option: 'remote', credits: 1 }, 1).score).toBe(10);
  });

  it('rejects missing credits', () => {
    expect(() => computeScore('intl_internship', { option: 'in_person' }, 1)).toThrow('"credits"');
    expect(() => computeScore('intl_internship', { option: 'in_person', credits: 0 }, 1)).toThrow(
      '"credits"'
    );
  });
});

describe('moodle GATE (all-or-nothing, flat evidence)', () => {
  it('development with ALL six materials = 150', () => {
    expect(
      computeScore('moodle_course', { mode: 'development', ...allMoodleMaterials() }, 1)
    ).toEqual({ computedValue: MOODLE_MODE_POINTS.development, score: 150 });
  });

  it('update with ALL six materials = 50', () => {
    expect(
      computeScore('moodle_course', { mode: 'update', ...allMoodleMaterials() }, 1).score
    ).toBe(50);
  });

  it('ANY single missing material gives 0 (both modes)', () => {
    for (const missing of MOODLE_MATERIALS) {
      const evidence = { ...allMoodleMaterials(), [missing]: false };
      expect(
        computeScore('moodle_course', { mode: 'development', ...evidence }, 1).score,
        `development missing ${missing}`
      ).toBe(0);
      expect(
        computeScore('moodle_course', { mode: 'update', ...evidence }, 1).score,
        `update missing ${missing}`
      ).toBe(0);
    }
  });

  it('rejects unknown mode', () => {
    expect(() =>
      computeScore('moodle_course', { mode: 'elective', ...allMoodleMaterials() }, 1)
    ).toThrow('"mode"');
  });
});

describe('guards', () => {
  it('rejects unknown activity type code (incl. items removed in 2026)', () => {
    expect(() => computeScore('nope', {}, 1)).toThrow('Unknown activity type code');
    // removed in 2026 — must not exist
    expect(() => computeScore('article_other_editions', { pages: 7, authors: 2 }, 1)).toThrow(
      'Unknown activity type code'
    );
  });

  it('rejects invalid coefficient and non-object evidence', () => {
    expect(() => computeScore('basic_education_match', {}, Number.NaN)).toThrow('coefficient');
    expect(() => computeScore('basic_education_match', {}, -1)).toThrow('coefficient');
    expect(() => computeScore('academic_rank', null, 1)).toThrow('evidence must be an object');
  });
});
