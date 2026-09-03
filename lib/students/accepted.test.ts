import { describe, expect, it } from 'vitest';
import accepted2026 from './accepted-2026.json';
import { registerOptions, type RegisterCriteria, type RegisterRow } from './accepted';

// The JSON is no longer what the app reads — `pnpm db:import-students` loads it
// into AdmittedStudent and the app queries that. It is still the best fixture
// there is: 1046 real rows with every shape the cascade has to survive, so
// these tests keep feeding it in by hand rather than inventing a fake register.
//
// What the file itself must satisfy — no birth dates, a speciality that has a
// норматив, one person once per programme — moved to prisma/import-students.test.ts,
// which is where that data is validated now that it is import input.

const ACCEPTED_STUDENTS = accepted2026 as RegisterRow[];

/**
 * The students behind one variant.
 *
 * Matches on ступінь too, which the app's own query does client-side. Without
 * it a combination holding both ступені would be counted twice here — the 2026
 * JSON is entirely бакалаври so it would never show, and the check below would
 * quietly stop meaning anything the day it did.
 */
function studentsMatching(criteria: RegisterCriteria & { degree: string }): RegisterRow[] {
  return ACCEPTED_STUDENTS.filter(
    (s) =>
      s.speciality === criteria.speciality &&
      s.degree === criteria.degree &&
      s.form === criteria.form &&
      s.funding === criteria.funding
  );
}

describe('registerOptions', () => {
  const options = registerOptions(ACCEPTED_STUDENTS, new Map());
  const branches = options.flatMap((s) => s.branches.map((b) => ({ speciality: s, branch: b })));

  it('offers every speciality once, university-wide', () => {
    // Not grouped by факультет any more. «Психологія» is taught on two of them
    // and must appear once, with all 75 of its students reachable.
    expect(options).toHaveLength(
      new Set(ACCEPTED_STUDENTS.map((s) => parentOf(s.speciality))).size
    );
    expect(options.map((s) => s.name).filter((n) => n === 'Психологія')).toHaveLength(1);

    for (const speciality of options) {
      expect(speciality.branches.length).toBeGreaterThan(0);
    }
  });

  it('offers only combinations that have a student behind them', () => {
    for (const { branch } of branches) {
      for (const variant of branch.variants) {
        const found = studentsMatching({ speciality: branch.speciality, ...variant });
        expect(
          found.length,
          `${branch.speciality} ${variant.form}/${variant.funding}`
        ).toBeGreaterThan(0);
      }
    }
  });

  it('reaches every student in the register', () => {
    const reachable = branches.flatMap(({ branch }) =>
      branch.variants.flatMap((variant) =>
        studentsMatching({ speciality: branch.speciality, ...variant })
      )
    );
    expect(reachable).toHaveLength(ACCEPTED_STUDENTS.length);
  });

  it('gathers «Психологія» into one list, whichever факультет teaches it', () => {
    const psychology = options.find((s) => s.name === 'Психологія');
    expect(psychology?.branches).toHaveLength(1);

    const students = psychology!.branches[0]!.variants.flatMap((variant) =>
      studentsMatching({ speciality: 'Психологія', ...variant })
    );
    expect(students).toHaveLength(97);
  });

  it('splits a спеціальність from its спеціалізація, and never half of one', () => {
    for (const speciality of options) {
      // Either every branch names a спеціалізація or none does. A mixture would
      // put «Без спеціалізації» in the select beside real subjects.
      const named = speciality.branches.filter((b) => b.name !== null);
      expect(named.length === 0 || named.length === speciality.branches.length).toBe(true);
      if (named.length === 0) expect(speciality.branches).toHaveLength(1);

      for (const b of speciality.branches) {
        expect(b.speciality.startsWith(speciality.name)).toBe(true);
        if (b.name) {
          const subject = b.name.charAt(0).toLowerCase() + b.name.slice(1);
          expect(b.speciality).toBe(`${speciality.name} (${subject})`);
        }
      }
    }
  });

  it('groups «Середня освіта» under one спеціальність with its subjects below', () => {
    const secondary = options.find((s) => s.name === 'Середня освіта');
    expect(secondary?.code).toBe('A4');
    // All thirteen subjects, no longer one факультет's three
    expect(secondary?.branches).toHaveLength(13);
    expect(secondary?.branches.map((b) => b.name)).toContain('Географія');
  });

  it('asks for no спеціалізація where the спеціальність has none', () => {
    const psychology = options.find((s) => s.name === 'Психологія');
    expect(psychology?.branches).toHaveLength(1);
    expect(psychology?.branches[0]?.name).toBeNull();
    expect(psychology?.branches[0]?.speciality).toBe('Психологія');
  });

  // The picker fills in and locks any level with a single answer, so this is
  // what decides whether a person is asked a question at all. «Філологія» has
  // exactly one спеціалізація — asking would be a click that decides nothing.
  it('leaves single-answer levels for the form to settle', () => {
    const single = options.filter((s) => s.branches.length === 1 && s.branches[0]!.name !== null);
    expect(single.map((s) => s.name)).toEqual(['Філологія']);
  });
});

/** «Середня освіта (географія)» → «Середня освіта» */
function parentOf(name: string): string {
  return name.replace(/\s*\([^)]+\)\s*$/, '');
}
