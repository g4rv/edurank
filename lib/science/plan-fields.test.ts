import { describe, expect, it } from 'vitest';
import type { EvidenceField } from '@/lib/rating/evidence-fields';
import { planFields } from './plan-fields';

// A stand-in article type carrying every field kind a real ScienceWorkType
// row can — title, a select, a number — so a wrong field name would show up
// as an unwanted extra rather than a coincidental match.
const FIELDS: EvidenceField[] = [
  { kind: 'text', name: 'title', label: 'Назва роботи' },
  {
    kind: 'select',
    name: 'option',
    label: 'Видання',
    options: [{ value: 'scopus', label: 'Scopus / WoS', points: 50 }],
  },
  { kind: 'number', name: 'credits', label: 'Сторінок', min: 1 },
  { kind: 'number', name: 'value', label: 'Кількість', min: 0 },
  { kind: 'number', name: 'pages', label: 'Сторінок', min: 1 },
  { kind: 'number', name: 'coAuthors', label: 'Співавторів', min: 1, optional: true },
  {
    kind: 'select',
    name: 'mode',
    label: 'Вид роботи',
    options: [{ value: 'development', label: 'Розроблення', points: 100 }],
  },
  { kind: 'checkbox', name: 'workProgram', label: 'Робоча програма', points: { development: 15 } },
  { kind: 'checkbox', name: 'syllabus', label: 'Силабус', points: { development: 5 } },
];

const names = (fields: EvidenceField[]) => fields.map((f) => f.name).sort();

describe('planFields', () => {
  it('FIXED needs nothing', () => {
    expect(planFields({ scoring: { kind: 'FIXED' }, evidenceFields: FIELDS })).toEqual([]);
  });

  it('MULT needs only "value"', () => {
    expect(names(planFields({ scoring: { kind: 'MULT' }, evidenceFields: FIELDS }))).toEqual([
      'value',
    ]);
  });

  it('SELECT needs only "option"', () => {
    expect(names(planFields({ scoring: { kind: 'SELECT' }, evidenceFields: FIELDS }))).toEqual([
      'option',
    ]);
  });

  it('SELECT_MULT needs "option" and "credits"', () => {
    expect(names(planFields({ scoring: { kind: 'SELECT_MULT' }, evidenceFields: FIELDS }))).toEqual(
      ['credits', 'option']
    );
  });

  it('CHECK_SUM needs "mode" and every checkbox — never "title"', () => {
    expect(names(planFields({ scoring: { kind: 'CHECK_SUM' }, evidenceFields: FIELDS }))).toEqual([
      'mode',
      'syllabus',
      'workProgram',
    ]);
  });

  it('never includes "title", regardless of scoring kind', () => {
    for (const kind of ['FIXED', 'MULT', 'SELECT', 'SELECT_MULT', 'CHECK_SUM'] as const) {
      expect(names(planFields({ scoring: { kind }, evidenceFields: FIELDS }))).not.toContain(
        'title'
      );
    }
  });

  it('MULT pageBased reads "pages" and "coAuthors" instead of "value"', () => {
    expect(
      names(planFields({ scoring: { kind: 'MULT', pageBased: true }, evidenceFields: FIELDS }))
    ).toEqual(['coAuthors', 'pages']);
  });

  it('SELECT_MULT pageBased reads "option", "pages" and "coAuthors" instead of "credits"', () => {
    expect(
      names(
        planFields({ scoring: { kind: 'SELECT_MULT', pageBased: true }, evidenceFields: FIELDS })
      )
    ).toEqual(['coAuthors', 'option', 'pages']);
  });

  it('degrades to no fields on an unknown scoring kind, rather than throwing', () => {
    expect(
      planFields({
        scoring: { kind: 'NOT_A_REAL_KIND' as never },
        evidenceFields: FIELDS,
      })
    ).toEqual([]);
  });

  it('skips a named field the type never declared', () => {
    const sparse: EvidenceField[] = [{ kind: 'text', name: 'title', label: 'Назва роботи' }];
    expect(planFields({ scoring: { kind: 'MULT' }, evidenceFields: sparse })).toEqual([]);
  });
});
