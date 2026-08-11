import { describe, expect, it } from 'vitest';
import { SPECIALITY_NORMS_2026 } from '@/lib/stake/norms';
import {
  KNOWLEDGE_BRANCHES,
  SPECIALITY_CODES,
  baseCode,
  branchOf,
  formatSpeciality,
  specialityCodeSortKey,
  subjectOf,
} from './codes';

const SEEDED = SPECIALITY_NORMS_2026.map(([name]) => name);

// The two lists are keyed by the same strings and live in different files. That
// only works while somebody notices when one of them changes — a speciality
// renamed in norms.ts would otherwise silently lose its code, and the screen
// would show a name with no number beside it and no error anywhere.
describe('the code table covers exactly the seeded specialities', () => {
  it('has an entry for every seeded speciality', () => {
    const missing = SEEDED.filter((name) => !(name in SPECIALITY_CODES));
    expect(missing).toEqual([]);
  });

  it('has no entry for a speciality that is not seeded', () => {
    const extra = Object.keys(SPECIALITY_CODES).filter((name) => !SEEDED.includes(name));
    expect(extra).toEqual([]);
  });
});

describe('codes are well formed', () => {
  it('every non-null code starts with a real branch letter', () => {
    for (const [name, { code }] of Object.entries(SPECIALITY_CODES)) {
      if (!code) continue;
      expect(branchOf(code), name).not.toBeNull();
    }
  });

  it('every code is a letter, a number, and an optional sub-number', () => {
    for (const [name, { code }] of Object.entries(SPECIALITY_CODES)) {
      if (!code) continue;
      expect(code, name).toMatch(/^[A-K]\d{1,2}(\.\d{2})?$/);
    }
  });

  // The whole premise of the mapping: A4.03 is 014.03 with a new prefix.
  it('keeps the предметна number when the legacy code had one', () => {
    for (const [name, { code, legacy }] of Object.entries(SPECIALITY_CODES)) {
      if (!code || !legacy) continue;
      const legacySuffix = legacy.split('.')[1];
      const codeSuffix = code.split('.')[1];
      if (legacySuffix && codeSuffix) expect(codeSuffix, name).toBe(legacySuffix);
    }
  });

  it('explains itself wherever there is no new code', () => {
    for (const [name, entry] of Object.entries(SPECIALITY_CODES)) {
      if (entry.code === null) expect(entry.note, name).toBeTruthy();
    }
  });

  it('branch letters are the eleven of постанова 1021', () => {
    expect(Object.keys(KNOWLEDGE_BRANCHES)).toHaveLength(11);
  });
});

describe('the owner’s own example', () => {
  it('maps Середня освіта to A4 and Історія to A4.03', () => {
    const history = SPECIALITY_CODES['Середня освіта (історія)'];
    expect(history.code).toBe('A4.03');
    expect(baseCode(history.code!)).toBe('A4');
  });
});

describe('subjectOf', () => {
  it('pulls the subject out and capitalises it', () => {
    expect(subjectOf('Середня освіта (історія)')).toBe('Історія');
  });

  it('is null when there is no bracket', () => {
    expect(subjectOf('Економіка')).toBeNull();
  });
});

describe('formatSpeciality', () => {
  const history = 'Середня освіта (історія)';

  it('writes each style the way its screen needs it', () => {
    expect(formatSpeciality(history, 'name')).toBe(history);
    expect(formatSpeciality(history, 'code')).toBe('A4.03');
    expect(formatSpeciality(history, 'full')).toBe('A4.03 Середня освіта (історія)');
    expect(formatSpeciality(history, 'compact')).toBe('A4.03 · Історія');
    expect(formatSpeciality(history, 'both')).toBe('014.03 / A4.03');
  });

  it('falls back to the name where nothing maps, never to an empty cell', () => {
    const merged = 'Професійна освіта (охорона праці)';
    expect(formatSpeciality(merged, 'full')).toBe(merged);
    expect(formatSpeciality(merged, 'compact')).toBe(merged);
    // «code» has nothing but the legacy speciality to offer, and says so
    expect(formatSpeciality(merged, 'code')).toBe('015');
  });

  it('survives a name that is not in the table at all', () => {
    expect(formatSpeciality('Вигадана спеціальність', 'full')).toBe('Вигадана спеціальність');
    expect(formatSpeciality('Вигадана спеціальність', 'code')).toBe('—');
  });
});

describe('specialityCodeSortKey', () => {
  it('orders by branch, then speciality, then subject — not alphabetically', () => {
    const sorted = [
      'Середня освіта (трудове навчання і технології)', // A4.10
      'Економіка', // C1
      'Середня освіта (історія)', // A4.03
      'Дошкільна освіта', // A2
    ].sort((a, b) => specialityCodeSortKey(a).localeCompare(specialityCodeSortKey(b)));

    expect(sorted).toEqual([
      'Дошкільна освіта',
      'Середня освіта (історія)',
      'Середня освіта (трудове навчання і технології)',
      'Економіка',
    ]);
  });

  // A plain string sort puts «A4.10» before «A4.03» is false, but it DOES put
  // «A4.10» before «A4.2» — the padding is what stops that.
  it('puts .10 after .03 rather than between .01 and .04', () => {
    const three = specialityCodeSortKey('Середня освіта (історія)');
    const ten = specialityCodeSortKey('Середня освіта (трудове навчання і технології)');
    expect(three < ten).toBe(true);
  });

  it('pushes uncoded specialities to the end', () => {
    const coded = specialityCodeSortKey('Економіка');
    const uncoded = specialityCodeSortKey('Професійна освіта (охорона праці)');
    expect(coded < uncoded).toBe(true);
  });
});
