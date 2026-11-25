import { describe, expect, it } from 'vitest';
import { catalogueType } from '@/lib/rating/db-specs';
import { computeScore } from '@/lib/rating/scoring';
import { planConversion, type StoredType } from './scientific-school-circle-plan';

// 3.17: the школа alone (FIXED, 500) becomes школа OR гурток / проблемна група
// (owner, 2026-11-25). The catalogue for a seeded database, the plan for one
// that already has the old row.

const OLD_ROW: StoredType = {
  label: 'Керівництво науковою школою',
  coefficient: 500,
  coefficientNote: null,
  evidenceFields: [{ kind: 'text', name: 'title', label: 'Назва наукової школи' }],
  scoring: { kind: 'FIXED' },
};

describe('3.17 in the catalogue', () => {
  const type = catalogueType('scientific_school');

  it('pays 500 for a школа and 100 for a гурток / проблемна група', () => {
    expect(computeScore(type, { option: 'school', title: 'Школа' }).score).toBe(500);
    expect(computeScore(type, { option: 'circle', title: 'Гурток' }).score).toBe(100);
  });

  it('feeds Характеристика п.14 from both options', () => {
    expect(type.specs.licencePositions).toEqual([{ position: 14 }]);
  });

  it('takes a наказ number but does not require one', () => {
    expect(type.schema.safeParse({ option: 'circle', title: 'Гурток' }).success).toBe(true);
    expect(
      type.schema.safeParse({ option: 'circle', title: 'Гурток', basis: '№ 12' }).success
    ).toBe(true);
  });
});

describe('planConversion', () => {
  it('turns the old row into the two-option form, the school keeping 500', () => {
    const plan = planConversion(OLD_ROW);
    if (plan.kind !== 'convert') throw new Error(plan.kind);
    const [choice, title, basis] = plan.data.evidenceFields;
    expect(choice).toMatchObject({
      kind: 'select',
      name: 'option',
      options: [
        { value: 'school', points: 500 },
        { value: 'circle', points: 100 },
      ],
    });
    expect(title).toMatchObject({
      name: 'title',
      label: 'Назва наукової школи / гуртка / проблемної групи',
    });
    expect(basis).toMatchObject({ name: 'basis', optional: true });
    expect(plan.data.scoring).toEqual({ kind: 'SELECT' });
    expect(plan.data.coefficient).toBe(1);
    expect(plan.data.label).toMatch(/гуртком \/ проблемною групою$/);
  });

  it('scores an old entry, given the «школа» answer, as it scored before', () => {
    const plan = planConversion(OLD_ROW);
    if (plan.kind !== 'convert') throw new Error(plan.kind);
    const type = { code: 'scientific_school', ...plan.data };
    expect(computeScore(type, { title: 'Школа', option: 'school' }).score).toBe(500);
  });

  it("keeps an admin's own points for the школа and says so in the note", () => {
    const plan = planConversion({ ...OLD_ROW, coefficient: 450 });
    if (plan.kind !== 'convert') throw new Error(plan.kind);
    expect(plan.data.coefficientNote).toBe(
      'наукова школа — 450, науковий гурток / проблемна група — 100'
    );
  });

  it("keeps an admin's own label and title wording", () => {
    const plan = planConversion({
      ...OLD_ROW,
      label: 'Керівництво НШ',
      evidenceFields: [{ kind: 'text', name: 'title', label: 'Школа' }],
    });
    if (plan.kind !== 'convert') throw new Error(plan.kind);
    expect(plan.keptLabel).toBe(true);
    expect(plan.data.label).toBe('Керівництво НШ');
    expect(plan.data.evidenceFields[1]).toMatchObject({ name: 'title', label: 'Школа' });
  });

  it('leaves a row that already has the choice alone', () => {
    const converted = planConversion(OLD_ROW);
    if (converted.kind !== 'convert') throw new Error(converted.kind);
    expect(planConversion({ ...OLD_ROW, ...converted.data })).toEqual({ kind: 'done' });
  });

  it('refuses a row whose rule is not the old FIXED one', () => {
    expect(planConversion({ ...OLD_ROW, scoring: { kind: 'MULT' } })).toMatchObject({
      kind: 'unexpected',
    });
  });
});
