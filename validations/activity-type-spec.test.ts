import { describe, expect, it } from 'vitest';
import type { EvidenceField } from '@/lib/rating/evidence-fields';
import { scoringFieldNames, specProblems, withScoringFields } from './activity-type-spec';

// The guard rails of the template editor: which fields a rule needs, how the
// builder reshapes a form when the rule changes, and what it refuses to save.

const text = (name: string): EvidenceField => ({ kind: 'text', name, label: name });

const scoredSelect = (name = 'option'): EvidenceField => ({
  kind: 'select',
  name,
  label: 'Роль',
  options: [
    { value: 'head', label: 'голова', points: 50 },
    { value: 'member', label: 'член', points: 20 },
  ],
});

describe('scoringFieldNames', () => {
  it('names nothing for a fixed rule — the coefficient is the whole story', () => {
    expect(scoringFieldNames({ kind: 'FIXED' })).toEqual([]);
  });

  it('names the numeric field a multiplying rule reads', () => {
    expect(scoringFieldNames({ kind: 'MULT' })).toEqual(['value']);
    expect(scoringFieldNames({ kind: 'SELECT_MULT' })).toEqual(['option', 'credits']);
  });

  it('swaps the count for pages when the rule is page-based', () => {
    expect(scoringFieldNames({ kind: 'MULT', pageBased: true })).toEqual(['pages', 'coAuthors']);
    expect(scoringFieldNames({ kind: 'SELECT_MULT', pageBased: true })).toEqual([
      'pages',
      'coAuthors',
      'option',
    ]);
  });
});

describe('withScoringFields', () => {
  it('adds the fields a rule needs', () => {
    const fields = withScoringFields([text('title')], { kind: 'SELECT' });
    expect(fields.map((f) => f.name)).toEqual(['option', 'title']);
    expect(fields[0].kind).toBe('select');
  });

  it('keeps the admin’s own fields untouched and in order', () => {
    const own = [text('title'), text('note')];
    const fields = withScoringFields(own, { kind: 'MULT' });
    expect(fields.map((f) => f.name)).toEqual(['value', 'title', 'note']);
  });

  it('drops the previous rule’s field when the rule changes', () => {
    const selectForm = withScoringFields([text('title')], { kind: 'SELECT' });
    const fixedForm = withScoringFields(selectForm, { kind: 'FIXED' });
    expect(fixedForm.map((f) => f.name)).toEqual(['title']);
  });

  it('swaps value for pages when page-based is switched on, and back again', () => {
    const byCount = withScoringFields([text('bibliography')], { kind: 'MULT' });
    expect(byCount.map((f) => f.name)).toEqual(['value', 'bibliography']);

    const bySheets = withScoringFields(byCount, { kind: 'MULT', pageBased: true });
    expect(bySheets.map((f) => f.name)).toEqual(['pages', 'coAuthors', 'bibliography']);

    const backToCount = withScoringFields(bySheets, { kind: 'MULT' });
    expect(backToCount.map((f) => f.name)).toEqual(['value', 'bibliography']);
  });

  it('does not duplicate a scoring field that is already there', () => {
    const once = withScoringFields([scoredSelect()], { kind: 'SELECT' });
    const twice = withScoringFields(once, { kind: 'SELECT' });
    expect(twice.filter((f) => f.name === 'option')).toHaveLength(1);
    // and it keeps the points the admin already entered
    const option = twice.find((f) => f.name === 'option');
    expect(option?.kind === 'select' && option.options[0].points).toBe(50);
  });

  it('produces a form that satisfies its own rule for every kind', () => {
    const rules = [
      { kind: 'FIXED' as const },
      { kind: 'MULT' as const },
      { kind: 'MULT' as const, pageBased: true },
      { kind: 'SELECT' as const },
      { kind: 'SELECT_MULT' as const },
      { kind: 'SELECT_MULT' as const, pageBased: true },
    ];
    for (const scoring of rules) {
      // Fresh scoring fields start at 0 points, which is valid — the admin
      // fills the real numbers in; the form is never born inconsistent.
      const fields = withScoringFields([], scoring);
      expect(specProblems(fields, scoring), JSON.stringify(scoring)).toEqual([]);
    }
  });
});

describe('specProblems', () => {
  it('accepts a coherent select rule', () => {
    expect(specProblems([scoredSelect(), text('link')], { kind: 'SELECT' })).toEqual([]);
  });

  it('refuses a select rule with no option select', () => {
    const problems = specProblems([text('title')], { kind: 'SELECT' });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('список вибору');
  });

  it('refuses options that carry no points, naming them', () => {
    const half: EvidenceField = {
      kind: 'select',
      name: 'option',
      label: 'Роль',
      options: [
        { value: 'head', label: 'голова', points: 50 },
        { value: 'member', label: 'член' },
      ],
    };
    const problems = specProblems([half], { kind: 'SELECT' });
    expect(problems[0]).toContain('член');
  });

  it('refuses a scoring field made optional — the rule needs a value', () => {
    const optionalValue: EvidenceField = {
      kind: 'number',
      name: 'value',
      label: 'Значення',
      optional: true,
    };
    expect(specProblems([optionalValue], { kind: 'MULT' })[0]).toContain("необов'язковим");
  });

  it('refuses a scoring field of the wrong kind', () => {
    expect(specProblems([text('value')], { kind: 'MULT' })[0]).toContain('має бути типу');
  });

  it('refuses duplicate machine names', () => {
    const problems = specProblems([text('title'), text('title')], { kind: 'FIXED' });
    expect(problems[0]).toContain('повторюються');
  });

  it('refuses page-based arithmetic on a rule that does not multiply', () => {
    const problems = specProblems([scoredSelect()], { kind: 'SELECT', pageBased: true });
    expect(problems.some((p) => p.includes('друкованими аркушами'))).toBe(true);
  });

  it('refuses a gate with no mandatory checkbox', () => {
    const problems = specProblems([scoredSelect('mode')], { kind: 'GATE' });
    expect(problems[0]).toContain('чекбокса');
  });

  it('accepts a gate that has one', () => {
    const fields: EvidenceField[] = [
      scoredSelect('mode'),
      { kind: 'checkbox', name: 'plan', label: 'План', mustBeTrue: true },
    ];
    expect(specProblems(fields, { kind: 'GATE' })).toEqual([]);
  });
});
