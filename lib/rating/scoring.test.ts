import { describe, expect, it } from 'vitest';
import { ACTIVITY_TYPES_2026 } from './activity-types';
import { catalogueType } from './db-specs';
import { computeScore, type ScorableType } from './scoring';
import type { EvidenceField } from './evidence-fields';

// The engine is driven entirely by an ActivityType row (its scoring spec + its
// evidence field specs). These tests feed it the 2026 catalogue through the
// same conversion the seed uses, plus a hand-built type standing in for one an
// admin creates in the template editor.

/** Score a catalogue code, optionally overriding its coefficient */
function score(code: string, evidence: unknown, coefficient?: number) {
  const type = catalogueType(code);
  return computeScore(coefficient === undefined ? type : { ...type, coefficient }, evidence);
}

const defsByKind = (kind: string) => ACTIVITY_TYPES_2026.filter((t) => t.kind === kind);

/** The scored material checkboxes of moodle_course, straight off its field specs */
const moodleMaterials = catalogueType('moodle_course').evidenceFields.filter(
  (f): f is Extract<EvidenceField, { kind: 'checkbox' }> =>
    f.kind === 'checkbox' && f.points !== undefined
);

function allMoodleMaterials(present = true): Record<string, boolean> {
  return Object.fromEntries(moodleMaterials.map((m) => [m.name, present]));
}

describe('catalogue ↔ scoring consistency', () => {
  it('SELECT / SELECT_MULT / CHECK_SUM types have coefficient 1 in 2026', () => {
    for (const def of ACTIVITY_TYPES_2026) {
      if (def.kind === 'SELECT' || def.kind === 'SELECT_MULT' || def.kind === 'CHECK_SUM') {
        expect(def.coefficient, def.code).toBe(1);
      }
    }
  });
});

describe('FIXED types', () => {
  it('every FIXED type scores exactly its coefficient (computedValue = 1)', () => {
    for (const def of defsByKind('FIXED')) {
      expect(score(def.code, {}), def.code).toEqual({
        computedValue: 1,
        score: def.coefficient,
      });
    }
  });
});

describe('SELECT types', () => {
  it('every option of every SELECT type returns its own points', () => {
    for (const def of defsByKind('SELECT')) {
      const type = catalogueType(def.code);
      const select = type.evidenceFields.find((f) => f.kind === 'select' && f.name === 'option');
      expect(select?.kind, def.code).toBe('select');
      if (select?.kind !== 'select') continue;

      for (const option of select.options) {
        expect(score(def.code, { option: option.value }), `${def.code}.${option.value}`).toEqual({
          computedValue: option.points,
          score: option.points,
        });
      }
    }
  });

  it('publication_cat_a quartiles: Q1=600, Q2=500, Q3-4/none=400', () => {
    expect(score('publication_cat_a', { option: 'q1' }).score).toBe(600);
    expect(score('publication_cat_a', { option: 'q2' }).score).toBe(500);
    expect(score('publication_cat_a', { option: 'q3_4_or_none' }).score).toBe(400);
  });

  it('coefficient scales option points (admin can rescale a whole item)', () => {
    expect(score('publication_cat_a', { option: 'q1' }, 2).score).toBe(1200);
    expect(score('publication_cat_a', { option: 'q1' }, 0).score).toBe(0);
  });

  it('rejects unknown option', () => {
    expect(() => score('academic_rank', { option: 'rector' })).toThrow('unknown option');
    expect(() => score('academic_rank', {})).toThrow('unknown option');
  });
});

describe('MULT types (value × coefficient)', () => {
  it('pedagogical experience: 1 point per year', () => {
    expect(score('pedagogical_experience', { value: 24 })).toEqual({
      computedValue: 24,
      score: 24,
    });
  });

  it('teaching load: entered points × 1', () => {
    expect(score('teaching_load', { value: 87 }).score).toBe(87);
  });

  it('citations: h-index × per-base points', () => {
    expect(score('citations_wos', { value: 5 }, 100).score).toBe(500);
    expect(score('citations_scholar', { value: 7 }, 10).score).toBe(70);
    expect(score('citations_scopus', { value: 0 }, 100).score).toBe(0);
  });

  it('rejects missing or negative value', () => {
    expect(() => score('pedagogical_experience', {})).toThrow('"value"');
    expect(() => score('citations_wos', { value: -1 }, 100)).toThrow('"value"');
  });
});

describe('monographs (author sheets: pages / 24 / coAuthors)', () => {
  it('ukrainian monograph: 120 pages, 2 co-authors, ×200', () => {
    expect(score('monograph_ua', { pages: 120, coAuthors: 2 }, 200)).toEqual({
      computedValue: 2.5,
      score: 500,
    });
  });

  it('EU-language monograph: sole author by default, ×300', () => {
    expect(score('monograph_eu', { pages: 48 }, 300)).toEqual({
      computedValue: 2,
      score: 600,
    });
  });

  it('rounds to 2 decimals without double-rounding the score', () => {
    // 100 / 24 = 4.1666… → computedValue 4.17, score = raw × 200 = 833.33
    expect(score('monograph_ua', { pages: 100 }, 200)).toEqual({
      computedValue: 4.17,
      score: 833.33,
    });
  });

  it('rejects zero pages and invalid coAuthors', () => {
    expect(() => score('monograph_ua', { pages: 0 }, 200)).toThrow('"pages"');
    expect(() => score('monograph_ua', { pages: 24, coAuthors: 0 }, 200)).toThrow('"coAuthors"');
    expect(() => score('monograph_ua', { pages: 24, coAuthors: 1.5 }, 200)).toThrow('"coAuthors"');
  });
});

describe('SELECT_MULT types', () => {
  it('editions: type points × author sheets', () => {
    // textbook: 200 × (240/24)/3 = 666.67
    expect(score('edition_publication', { option: 'textbook', pages: 240, coAuthors: 3 })).toEqual({
      computedValue: 666.67,
      score: 666.67,
    });
    // recommendations: 80 × (24/24)/1 = 80
    expect(score('edition_publication', { option: 'recommendations', pages: 24 }).score).toBe(80);
  });

  it('internships: per-credit points × credits', () => {
    expect(score('intl_internship', { option: 'in_person', credits: 3 }).score).toBe(300);
    expect(score('intl_internship', { option: 'remote', credits: 2 }).score).toBe(40);
    expect(score('ukr_internship', { option: 'in_person', credits: 2 }).score).toBe(100);
    expect(score('ukr_internship', { option: 'remote', credits: 1 }).score).toBe(10);
  });

  it('rejects missing credits', () => {
    expect(() => score('intl_internship', { option: 'in_person' })).toThrow('"credits"');
    expect(() => score('intl_internship', { option: 'in_person', credits: 0 })).toThrow(
      '"credits"'
    );
  });

  // The floor belongs to the field, not to SELECT_MULT. 2026's стажування
  // declares min 1 and still refuses 0 (above); an indicator whose quantity is
  // a share — the 2025 template prices a monograph by друковані аркуші — says
  // min 0 and must be allowed to mean it.
  it('honours a min the field spec declares, rather than always demanding 1', () => {
    const base = catalogueType('intl_internship');
    const shareable: ScorableType = {
      ...base,
      evidenceFields: base.evidenceFields.map((f) =>
        f.kind === 'number' && f.name === 'credits' ? { ...f, min: 0 } : f
      ),
    };
    expect(computeScore(shareable, { option: 'in_person', credits: 0.5 }).score).toBe(50);
    expect(computeScore(shareable, { option: 'in_person', credits: 0 }).score).toBe(0);
    // …while the catalogue's own min 1 refuses the same half credit
    expect(() => score('intl_internship', { option: 'in_person', credits: 0.5 })).toThrow(
      '"credits"'
    );
  });
});

describe('moodle CHECK_SUM (sum of ticked materials, flat evidence)', () => {
  it('development with ALL six materials = 150', () => {
    expect(score('moodle_course', { mode: 'development', ...allMoodleMaterials() })).toEqual({
      computedValue: 150,
      score: 150,
    });
  });

  it('update with ALL six materials = 50', () => {
    expect(score('moodle_course', { mode: 'update', ...allMoodleMaterials() }).score).toBe(50);
  });

  it('a missing material costs exactly its own share, not the whole score', () => {
    expect(moodleMaterials).toHaveLength(6);
    for (const material of moodleMaterials) {
      for (const mode of ['development', 'update'] as const) {
        const full = mode === 'development' ? 150 : 50;
        const share = material.points?.[mode] ?? 0;
        expect(share, `${material.name} has no ${mode} points`).toBeGreaterThan(0);
        expect(
          score('moodle_course', { mode, ...allMoodleMaterials(), [material.name]: false }).score,
          `${mode} without ${material.name}`
        ).toBe(full - share);
      }
    }
  });

  // The regression this rule replaced: five of six materials used to score 0.
  it('five of six materials scores the five', () => {
    expect(
      score('moodle_course', {
        mode: 'development',
        ...allMoodleMaterials(),
        presentations: false,
      }).score
    ).toBe(120);
  });

  it('no materials at all scores 0', () => {
    expect(
      score('moodle_course', { mode: 'development', ...allMoodleMaterials(false) }).score
    ).toBe(0);
  });

  it('the material shares add up to their mode maximum', () => {
    for (const [mode, max] of [
      ['development', 150],
      ['update', 50],
    ] as const) {
      const total = moodleMaterials.reduce((sum, m) => sum + (m.points?.[mode] ?? 0), 0);
      expect(total, mode).toBe(max);
    }
  });

  it('rejects an unknown mode even when nothing is ticked', () => {
    expect(() => score('moodle_course', { mode: 'elective', ...allMoodleMaterials() })).toThrow(
      'unknown option'
    );
    expect(() =>
      score('moodle_course', { mode: 'elective', ...allMoodleMaterials(false) })
    ).toThrow('unknown option');
  });
});

// The point of moving specs into the DB: an indicator nobody wrote code for
// still scores. These types exist only here — no catalogue entry, no constant.
describe('admin-defined types (specs the engine has never seen)', () => {
  const jury: ScorableType = {
    code: 'startup_jury',
    coefficient: 1,
    scoring: { kind: 'SELECT' },
    evidenceFields: [
      {
        kind: 'select',
        name: 'option',
        label: 'Роль',
        options: [
          { value: 'head', label: 'голова журі', points: 50 },
          { value: 'member', label: 'член журі', points: 20 },
        ],
      },
      { kind: 'url', name: 'link', label: 'Підтвердження' },
    ],
  };

  it('scores a select type built entirely from its own specs', () => {
    expect(computeScore(jury, { option: 'head', link: 'https://example.com' }).score).toBe(50);
    expect(computeScore(jury, { option: 'member', link: 'https://example.com' }).score).toBe(20);
  });

  it('applies the coefficient to an admin-defined item', () => {
    expect(computeScore({ ...jury, coefficient: 3 }, { option: 'member' }).score).toBe(60);
  });

  it('supports a check-sum type with its own scored checkboxes', () => {
    const portfolio: ScorableType = {
      code: 'portfolio',
      coefficient: 1,
      scoring: { kind: 'CHECK_SUM' },
      evidenceFields: [
        {
          kind: 'select',
          name: 'mode',
          label: 'Вид',
          options: [{ value: 'full', label: 'повне', points: 90 }],
        },
        { kind: 'checkbox', name: 'plan', label: 'План', points: { full: 60 } },
        { kind: 'checkbox', name: 'report', label: 'Звіт', points: { full: 30 } },
        // No points — an ordinary flag must contribute nothing either way
        { kind: 'checkbox', name: 'extra', label: 'Додатково' },
      ],
    };

    expect(computeScore(portfolio, { mode: 'full', plan: true, report: true }).score).toBe(90);
    expect(computeScore(portfolio, { mode: 'full', plan: true, report: false }).score).toBe(60);
    expect(computeScore(portfolio, { mode: 'full', plan: false, report: false }).score).toBe(0);
    expect(
      computeScore(portfolio, { mode: 'full', plan: true, report: true, extra: true }).score
    ).toBe(90);
  });

  // A row written by an older build still says GATE. Throwing beats returning
  // NaN, which would look like a real score all the way into the totals.
  it('refuses a retired scoring kind rather than scoring it as NaN', () => {
    const legacy = {
      code: 'moodle_course',
      coefficient: 1,
      scoring: { kind: 'GATE' },
      evidenceFields: [
        {
          kind: 'select' as const,
          name: 'mode',
          label: 'Вид',
          options: [{ value: 'full', label: 'повне', points: 90 }],
        },
      ],
    } as unknown as ScorableType;
    expect(() => computeScore(legacy, { mode: 'full' })).toThrow('unknown scoring kind');
  });

  it('refuses a select option that carries no points', () => {
    const broken: ScorableType = {
      ...jury,
      evidenceFields: [
        {
          kind: 'select',
          name: 'option',
          label: 'Роль',
          options: [{ value: 'head', label: 'голова журі' }],
        },
      ],
    };
    expect(() => computeScore(broken, { option: 'head' })).toThrow('has no points');
  });

  it('refuses a scoring rule whose select is missing from the fields', () => {
    const broken: ScorableType = { ...jury, evidenceFields: [] };
    expect(() => computeScore(broken, { option: 'head' })).toThrow('no "option" select');
  });
});

describe('guards', () => {
  it('rejects unknown activity type code (incl. items removed in 2026)', () => {
    expect(() => score('nope', {})).toThrow('Unknown activity type code');
    // removed in 2026 — must not exist
    expect(() => score('article_other_editions', { pages: 7, authors: 2 })).toThrow(
      'Unknown activity type code'
    );
  });

  it('rejects invalid coefficient and non-object evidence', () => {
    expect(() => score('basic_education_match', {}, Number.NaN)).toThrow('coefficient');
    expect(() => score('basic_education_match', {}, -1)).toThrow('coefficient');
    expect(() => score('academic_rank', null)).toThrow('evidence must be an object');
  });
});
