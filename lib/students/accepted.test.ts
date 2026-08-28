import { describe, expect, it } from 'vitest';
import { FACULTIES } from '@/prisma/preprod-org';
import { SPECIALITY_CODES } from '@/lib/specialities/codes';
import { SPECIALITY_NORMS_2026 } from '@/lib/stake/norms';
import {
  ACCEPTED_STUDENTS,
  findAcceptedStudent,
  registerOptions,
  studentsMatching,
} from './accepted';

// The register is generated data that nothing in the app validates at runtime,
// so what a schema would normally enforce is enforced here instead. Each of
// these has a matching failure mode: a speciality the norms table does not know
// makes a student unclaimable, a факультет spelled the sheet's way makes a whole
// факультет's worth of them invisible, and a repeated programme row silently
// picks the wrong person's speciality when the claim is saved.

const FACULTY_NAMES = new Set(FACULTIES.map((f) => f.name));
const NORM_NAMES = new Set(SPECIALITY_NORMS_2026.map(([name]) => name));

// Every speciality in the register now has a норматив — the two додаток 5 omits
// («Музичне мистецтво», «Комп'ютерні науки») take theirs from постанова 1134,
// which додаток 5 is itself copied from. A speciality with no норматив is a
// student nobody can claim, so this stays pinned at zero rather than being
// allowed to grow an exception list again.

describe('the 2026 register', () => {
  it('holds every admitted student', () => {
    // 722 from the ЄДЕБО export + 324 transcribed from the контрактні накази:
    // 316 from №520 and №521 of 19.08.2026, and 8 more from №522 and №527,
    // added 2026-08-28 from a later export.
    expect(ACCEPTED_STUDENTS).toHaveLength(1046);
  });

  // NOT one row per person. Twenty people are admitted onto two programmes at
  // once — Немеш Вікторія Іванівна is on Фінанси and on Середня освіта
  // (історія), both on контракт — and each enrolment is a separate thing an НПП
  // can be credited with recruiting. What must stay unique is the key the claim
  // is actually saved by: ПІБ within one спеціальність, форма and фінансування.
  // A repeat there would let findAcceptedStudent return either of two people.
  it('names one person once per programme', () => {
    const keys = ACCEPTED_STUDENTS.map((s) =>
      [s.name.toLowerCase(), s.speciality, s.form, s.funding].join('|')
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('carries no birth date, contact or document number', () => {
    for (const student of ACCEPTED_STUDENTS) {
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

  it('spells every факультет the way the database does', () => {
    for (const student of ACCEPTED_STUDENTS) {
      expect(FACULTY_NAMES, student.name).toContain(student.faculty);
    }
  });

  it('names a speciality the codes list knows', () => {
    for (const student of ACCEPTED_STUDENTS) {
      expect(SPECIALITY_CODES[student.speciality], student.speciality).toBeDefined();
    }
  });

  it('names a speciality that has a норматив', () => {
    const unpriced = new Set(
      ACCEPTED_STUDENTS.map((s) => s.speciality).filter((name) => !NORM_NAMES.has(name))
    );
    expect([...unpriced]).toEqual([]);
  });
});

describe('registerOptions', () => {
  const options = registerOptions();
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

  it('gathers «Психологія» from both its факультети into one list', () => {
    const psychology = options.find((s) => s.name === 'Психологія');
    expect(psychology?.branches).toHaveLength(1);

    const students = psychology!.branches[0]!.variants.flatMap((variant) =>
      studentsMatching({ speciality: 'Психологія', ...variant })
    );
    expect(students).toHaveLength(97);
    expect(new Set(students.map((s) => s.faculty)).size).toBe(2);
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

describe('findAcceptedStudent', () => {
  const student = ACCEPTED_STUDENTS[0]!;
  const criteria = {
    speciality: student.speciality,
    form: student.form,
    funding: student.funding,
  };

  it('finds a student whose criteria all agree', () => {
    expect(findAcceptedStudent(student.name, criteria)).toEqual(student);
  });

  it('ignores spacing and case in the ПІБ', () => {
    expect(findAcceptedStudent(`  ${student.name.toUpperCase()}  `, criteria)).toEqual(student);
  });

  it('refuses a real student under criteria that are not theirs', () => {
    const wrongForm = student.form === 'FULL_TIME' ? 'PART_TIME' : 'FULL_TIME';
    expect(findAcceptedStudent(student.name, { ...criteria, form: wrongForm })).toBeNull();
    expect(
      findAcceptedStudent(student.name, { ...criteria, speciality: 'Вигадана спеціальність' })
    ).toBeNull();
  });

  it('refuses a name that is not in the register', () => {
    expect(findAcceptedStudent('Вигаданий Ніхто Ніхтович', criteria)).toBeNull();
  });
});
