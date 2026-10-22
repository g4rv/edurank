import { describe, expect, it } from 'vitest';
import { EMPTY_NARRATIVE } from '@/validations/department-report';
import { auditSnapshot } from './audit-snapshot';
import type { IndicatorRow } from './score';

const rows: IndicatorRow[] = [
  { id: 'h', itemNumber: '1', kind: 'HEADING', coefficient: 0, options: [], isActive: true },
  { id: 'c', itemNumber: '1.1', kind: 'COUNT', coefficient: 50, options: [], isActive: true },
  {
    id: 's',
    itemNumber: '3',
    kind: 'CHOICE',
    coefficient: 0,
    options: [{ label: '0-10 тис. грн.', points: 10 }],
    isActive: true,
  },
];

describe('auditSnapshot', () => {
  it('names each line by its number and prints a choice by its label', () => {
    const snap = auditSnapshot(rows, { c: 2, s: 0 }, EMPTY_NARRATIVE, 110);
    expect(snap['п. 1.1']).toBe(2);
    expect(snap['п. 3']).toBe('0-10 тис. грн.');
    expect(snap['Всього']).toBe(110);
    expect(snap).not.toHaveProperty('п. 1');
  });

  it('prints a box by its item and wording', () => {
    const narrative = {
      ...EMPTY_NARRATIVE,
      development: { ...EMPTY_NARRATIVE.development, name: 'Прилад' },
    };
    const snap = auditSnapshot(rows, {}, narrative, 0);
    expect(snap['п. 16 — Назва розробки, автори']).toBe('Прилад');
  });

  it('prints the chosen kind of impact', () => {
    const narrative = {
      ...EMPTY_NARRATIVE,
      impact: { ...EMPTY_NARRATIVE.impact, kind: 'на розвиток освіти' },
    };
    const snap = auditSnapshot(rows, {}, narrative as typeof EMPTY_NARRATIVE, 0);
    expect(snap['п. 17 — Основний вид впливу']).toBe('на розвиток освіти');
  });

  it('leaves an empty line out, so an untouched report diffs to nothing', () => {
    const snap = auditSnapshot(rows, {}, EMPTY_NARRATIVE, 0);
    expect(Object.keys(snap)).toEqual(['Всього']);
  });
});
