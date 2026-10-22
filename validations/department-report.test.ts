import { describe, expect, it } from 'vitest';
import {
  EMPTY_NARRATIVE,
  IMPACT_KINDS,
  NARRATIVE_LIMITS,
  departmentReportSchema,
  narrativeSchema,
  readNarrative,
} from './department-report';

describe('readNarrative', () => {
  it('keeps the chosen kind of impact', () => {
    const saved = {
      ...EMPTY_NARRATIVE,
      impact: { ...EMPTY_NARRATIVE.impact, kind: IMPACT_KINDS[6] },
    };
    expect(readNarrative(saved).impact.kind).toBe(IMPACT_KINDS[6]);
  });
});

const initiativeRow = { topic: 'Тема', results: '', expected: '' };
const study = { title: 'Назва', customer: '', lead: '', team: '', funding: '', results: '' };

const payload = (over: Record<string, unknown> = {}) => ({
  departmentId: 'dept-1',
  year: 2026,
  values: {},
  narrative: EMPTY_NARRATIVE,
  ...over,
});

describe('narrativeSchema', () => {
  it('accepts its own output', () => {
    const once = narrativeSchema.parse(EMPTY_NARRATIVE);
    expect(narrativeSchema.parse(once)).toEqual(EMPTY_NARRATIVE);
  });

  it('takes up to three rows of ініціативна тематика, not four', () => {
    const three = { ...EMPTY_NARRATIVE, initiative: [initiativeRow, initiativeRow, initiativeRow] };
    expect(narrativeSchema.safeParse(three).success).toBe(true);
    const four = { ...three, initiative: [...three.initiative, initiativeRow] };
    expect(narrativeSchema.safeParse(four).success).toBe(false);
  });

  it('takes up to two studies, not three', () => {
    expect(narrativeSchema.safeParse({ ...EMPTY_NARRATIVE, studies: [study, study] }).success).toBe(
      true
    );
    expect(
      narrativeSchema.safeParse({ ...EMPTY_NARRATIVE, studies: [study, study, study] }).success
    ).toBe(false);
  });

  it('holds 17.3 to 3000 characters', () => {
    const impact = (results: string) => ({ ...EMPTY_NARRATIVE.impact, results });
    expect(NARRATIVE_LIMITS.results).toBe(3000);
    expect(
      narrativeSchema.safeParse({ ...EMPTY_NARRATIVE, impact: impact('а'.repeat(3000)) }).success
    ).toBe(true);
    expect(
      narrativeSchema.safeParse({ ...EMPTY_NARRATIVE, impact: impact('а'.repeat(3001)) }).success
    ).toBe(false);
  });

  // 17.1 «Основний вид впливу» — one select (owner, 2026-10-21: a list of
  // ticks was tried the same day and reverted)
  describe('17.1, the kind of impact', () => {
    const kind = (k: unknown) => ({
      ...EMPTY_NARRATIVE,
      impact: { ...EMPTY_NARRATIVE.impact, kind: k },
    });

    it('lists the template’s twelve', () => {
      expect(IMPACT_KINDS).toHaveLength(12);
    });

    it('takes one of them, or none', () => {
      expect(narrativeSchema.safeParse(kind(IMPACT_KINDS[6])).success).toBe(true);
      expect(narrativeSchema.safeParse(kind(null)).success).toBe(true);
    });

    it('refuses one not in the list, and a list', () => {
      expect(narrativeSchema.safeParse(kind('на щось інше')).success).toBe(false);
      expect(narrativeSchema.safeParse(kind([IMPACT_KINDS[0], IMPACT_KINDS[6]])).success).toBe(
        false
      );
    });
  });
});

describe('departmentReportSchema', () => {
  // Owner, 2026-10-21: typed, whole numbers, up to 999. The schema lets 0 through
  // because a CHOICE's first option IS 0; a COUNT's 0 is refused by
  // `valuesProblem`, which knows the row's kind.
  it('accepts whole values up to 999, and 0 for a choice’s first option', () => {
    expect(
      departmentReportSchema.safeParse(payload({ values: { a: 1, b: 999, c: 0 } })).success
    ).toBe(true);
  });

  it('refuses 1000 and above', () => {
    expect(departmentReportSchema.safeParse(payload({ values: { a: 1000 } })).success).toBe(false);
  });

  it('refuses a fraction or a negative count', () => {
    expect(departmentReportSchema.safeParse(payload({ values: { a: 1.5 } })).success).toBe(false);
    expect(departmentReportSchema.safeParse(payload({ values: { a: -1 } })).success).toBe(false);
  });
});
