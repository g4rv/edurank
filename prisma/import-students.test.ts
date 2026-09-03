import { describe, expect, it } from 'vitest';
import { SPECIALITY_CODES } from '@/lib/specialities/codes';
import { SPECIALITY_NORMS_2026 } from '@/lib/stake/norms';
import accepted2026 from '@/lib/students/accepted-2026.json';
import { importKey, planImport, type SourceStudent } from './import-students';

const SOURCE = accepted2026 as SourceStudent[];
const NORM_NAMES = new Set(SPECIALITY_NORMS_2026.map(([name]) => name));

// These guarded lib/students/accepted-2026.json while it WAS the register. It is
// import input now, so they guard the import instead — same failure modes, one
// step later: a speciality the norms table does not know is a student nobody can
// claim, and a repeated key is a claim that would resolve to either of two people.

describe('the 2026 source file', () => {
  it('holds every admitted student', () => {
    // 722 from the ЄДЕБО export + 324 transcribed from the контрактні накази:
    // 316 from №520 and №521 of 19.08.2026, and 8 more from №522 and №527.
    expect(SOURCE).toHaveLength(1046);
  });

  it('carries no birth date, contact or document number', () => {
    for (const student of SOURCE) {
      expect(Object.keys(student).sort()).toEqual([
        'degree',
        'faculty',
        'form',
        'funding',
        'name',
        'speciality',
      ]);
      expect(student.name).not.toMatch(/\d/);
    }
  });

  it('names a speciality the codes list knows', () => {
    for (const student of SOURCE) {
      expect(SPECIALITY_CODES[student.speciality], student.speciality).toBeDefined();
    }
  });

  it('names a speciality that has a норматив', () => {
    const unpriced = new Set(
      SOURCE.map((s) => s.speciality).filter((name) => !NORM_NAMES.has(name))
    );
    expect([...unpriced]).toEqual([]);
  });

  // NOT one row per person: twenty people are admitted onto two programmes at
  // once. What must stay unique is the key the row is stored and looked up by.
  it('names one person once per programme', () => {
    const keys = SOURCE.map((s) => importKey(2026, s));
    expect(new Set(keys).size).toBe(keys.length);
  });
});

const IDS = new Map([
  ['Психологія', 'sp-psy'],
  ['Початкова освіта', 'sp-prim'],
]);

function student(over: Partial<SourceStudent> = {}): SourceStudent {
  return {
    name: 'Ковальчук Олена Ігорівна',
    speciality: 'Психологія',
    degree: 'BACHELOR',
    form: 'FULL_TIME',
    funding: 'STATE',
    ...over,
  };
}

describe('planImport', () => {
  it('plans a row with the ПІБ normalised and the speciality resolved to an id', () => {
    const plan = planImport(2026, [student()], IDS, new Set());

    expect(plan.problems).toEqual([]);
    expect(plan.skipped).toEqual([]);
    expect(plan.create).toEqual([
      {
        year: 2026,
        name: 'Ковальчук Олена Ігорівна',
        nameNormalised: 'ковальчук олена ігорівна',
        specialityId: 'sp-psy',
        degree: 'BACHELOR',
        form: 'FULL_TIME',
        funding: 'STATE',
      },
    ]);
  });

  it('skips a row the database already holds, and does not call it a problem', () => {
    const existing = new Set([importKey(2026, student())]);

    const plan = planImport(2026, [student()], IDS, existing);

    expect(plan.create).toEqual([]);
    expect(plan.skipped).toHaveLength(1);
    expect(plan.problems).toEqual([]);
  });

  it('skips a row the same FILE lists twice', () => {
    const plan = planImport(2026, [student(), student()], IDS, new Set());

    expect(plan.create).toHaveLength(1);
    expect(plan.skipped).toHaveLength(1);
  });

  // Two programmes, one person — the case the key exists for.
  it('keeps one person twice when the programme differs', () => {
    const plan = planImport(
      2026,
      [student(), student({ speciality: 'Початкова освіта' })],
      IDS,
      new Set()
    );

    expect(plan.create).toHaveLength(2);
    expect(plan.skipped).toEqual([]);
  });

  it('reports an unresolvable speciality instead of inventing one', () => {
    const plan = planImport(2026, [student({ speciality: 'Вигадана' })], IDS, new Set());

    expect(plan.create).toEqual([]);
    expect(plan.problems).toEqual([
      'Ковальчук Олена Ігорівна: спеціальності «Вигадана» немає в базі',
    ]);
  });

  // The same ПІБ in two campaigns is two students, not a duplicate.
  it('keys by year, so another campaign is never a duplicate', () => {
    const existing = new Set([importKey(2026, student())]);

    const plan = planImport(2027, [student()], IDS, existing);

    expect(plan.create).toHaveLength(1);
    expect(plan.create[0]!.year).toBe(2027);
  });
});
