import { describe, expect, it } from 'vitest';
import { DEPARTMENT_INDICATORS_2026, DERIVATIONS_2026 } from './catalogue-2026';
import { readDerivation } from './derivation';
import { ACTIVITY_TYPES_2026 } from '@/lib/rating/activity-types';
import { EVIDENCE_FIELDS } from '@/lib/rating/evidence-fields';

// The mapping names fields of OTHER forms by name, so a renamed field would
// silently count nothing. These checks are the contract between the two.
describe('DERIVATIONS_2026', () => {
  const codes = new Set(ACTIVITY_TYPES_2026.map((t) => t.code));

  it('maps only COUNT lines that exist', () => {
    for (const itemNumber of Object.keys(DERIVATIONS_2026)) {
      expect(byItemLine(itemNumber)?.kind, itemNumber).toBe('COUNT');
    }
  });

  it('is a valid stored mapping on every line', () => {
    for (const [itemNumber, d] of Object.entries(DERIVATIONS_2026)) {
      expect(readDerivation(d), itemNumber).toEqual(d);
    }
  });

  it('names real personal indicators, fields and options', () => {
    for (const [itemNumber, d] of Object.entries(DERIVATIONS_2026)) {
      for (const source of d.from) {
        const where = `${itemNumber} ← ${source.code}`;
        expect(codes.has(source.code), where).toBe(true);
        const fields = EVIDENCE_FIELDS[source.code] ?? [];
        const names = new Set(fields.map((f) => f.name));
        for (const key of source.keys) expect(names.has(key), `${where} key ${key}`).toBe(true);
        expect(names.has(source.text), `${where} text ${source.text}`).toBe(true);
        if (source.when) {
          const field = fields.find((f) => f.name === source.when!.field);
          expect(field?.kind, `${where} when`).toBe('select');
          const options = new Set(
            field && field.kind === 'select' ? field.options.map((o) => o.value) : []
          );
          for (const value of source.when.in) {
            expect(options.has(value), `${where} option ${value}`).toBe(true);
          }
        }
      }
    }
  });

  it('links exactly the agreed lines, FULL and PARTIAL', () => {
    const full = Object.entries(DERIVATIONS_2026)
      .filter(([, d]) => d.coverage === 'FULL')
      .map(([n]) => n);
    expect(full.sort()).toEqual(['13.1', '13.2', '5', '7.1', '7.2', '7.4', '9']);
    expect(Object.keys(DERIVATIONS_2026)).toHaveLength(11);
  });
});

function byItemLine(itemNumber: string) {
  return DEPARTMENT_INDICATORS_2026.find((d) => d.itemNumber === itemNumber);
}

const byItem = (itemNumber: string) =>
  DEPARTMENT_INDICATORS_2026.find((d) => d.itemNumber === itemNumber);

describe('DEPARTMENT_INDICATORS_2026', () => {
  it('holds the sheet’s 32 rows and 7.4: 5 headings, 27 counts and one choice', () => {
    expect(DEPARTMENT_INDICATORS_2026).toHaveLength(33);
    const kinds = DEPARTMENT_INDICATORS_2026.map((d) => d.kind);
    expect(kinds.filter((k) => k === 'HEADING')).toHaveLength(5);
    expect(kinds.filter((k) => k === 'COUNT')).toHaveLength(27);
    expect(kinds.filter((k) => k === 'CHOICE')).toHaveLength(1);
  });

  it('numbers every row once', () => {
    const numbers = DEPARTMENT_INDICATORS_2026.map((d) => d.itemNumber);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it('gives every count a positive coefficient', () => {
    for (const d of DEPARTMENT_INDICATORS_2026.filter((d) => d.kind === 'COUNT')) {
      expect(d.coefficient, d.itemNumber).toBeGreaterThan(0);
    }
  });

  it('prices the rows as the sheet does', () => {
    expect(byItem('1.1')?.coefficient).toBe(50);
    expect(byItem('10')?.coefficient).toBe(0.5);
    expect(byItem('12.2')?.coefficient).toBe(5);
    expect(byItem('13.2')?.coefficient).toBe(10);
  });

  // 7.4 (owner, 2026-11-24): a «Б» publication scores 2 a record, counted from 3.9
  it('has 7.4, the «Б» category, at 2 points a record, right after 7.3', () => {
    expect(byItem('7.4')).toMatchObject({ kind: 'COUNT', coefficient: 2 });
    // the owner's wording, exactly: no «України», no «всього одиниць»
    expect(byItem('7.4')?.label).toBe('у фахових виданнях категорії «Б»');
    const numbers = DEPARTMENT_INDICATORS_2026.map((d) => d.itemNumber);
    expect(numbers.indexOf('7.4')).toBe(numbers.indexOf('7.3') + 1);
    // …and counted from the personal 3.9, the same category in longer words
    expect(DERIVATIONS_2026['7.4']).toMatchObject({
      coverage: 'FULL',
      from: [{ code: 'publication_cat_b' }],
    });
  });

  it('makes item 3 a choice of three amounts', () => {
    expect(byItem('3')).toMatchObject({
      kind: 'CHOICE',
      options: [
        { label: '0-10 тис. грн.', points: 10 },
        { label: '10-20 тис. грн.', points: 20 },
        { label: 'більше 20 тис. грн.', points: 30 },
      ],
    });
  });

  it('keeps the five group headings as headings', () => {
    for (const n of ['1', '2', '6', '7', '12']) expect(byItem(n)?.kind, n).toBe('HEADING');
  });
});
