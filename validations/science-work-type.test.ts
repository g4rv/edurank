import { describe, expect, it } from 'vitest';
import { identityCandidates, identityFieldProblem } from './science-work-type';
import type { EvidenceField } from '@/lib/rating/evidence-fields';

const FIELDS: EvidenceField[] = [
  {
    kind: 'text',
    name: 'candidateLast',
    label: 'Прізвище',
    join: 'candidate',
    joinLabel: 'ПІБ здобувача',
  },
  { kind: 'text', name: 'candidateFirst', label: 'Ім’я', join: 'candidate' },
  { kind: 'text', name: 'candidateMiddle', label: 'По батькові', join: 'candidate' },
  { kind: 'text', name: 'title', label: 'Назва роботи' },
];

describe('identityCandidates', () => {
  it('offers a joined ПІБ as ONE entry, never its single boxes', () => {
    expect(identityCandidates(FIELDS)).toEqual([
      { name: 'candidate', label: 'ПІБ здобувача' },
      { name: 'title', label: 'Назва роботи' },
    ]);
  });
});

describe('identityFieldProblem', () => {
  it('accepts a joined group by its name', () => {
    expect(identityFieldProblem(['candidate', 'title'], FIELDS)).toBeNull();
  });

  it('refuses a single box of a group — a surname alone is not an identity', () => {
    expect(identityFieldProblem(['candidateLast'], FIELDS)).toBe(
      'Поле ідентичності «candidateLast» відсутнє серед полів форми'
    );
  });

  it('refuses a name the form does not have', () => {
    expect(identityFieldProblem(['doi'], FIELDS)).toBe(
      'Поле ідентичності «doi» відсутнє серед полів форми'
    );
  });
});
