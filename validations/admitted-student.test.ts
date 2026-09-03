import { describe, expect, it } from 'vitest';
import { admittedStudentSchema } from './admitted-student';

const valid = {
  name: 'Ковальчук Олена Ігорівна',
  specialityId: 'sp1',
  degree: 'BACHELOR',
  form: 'FULL_TIME',
  funding: 'STATE',
  year: '2026',
};

describe('admittedStudentSchema', () => {
  it('accepts a complete row and gives the year back as a number', () => {
    const parsed = admittedStudentSchema.parse(valid);
    expect(parsed.year).toBe(2026);
  });

  it('trims the ПІБ', () => {
    expect(admittedStudentSchema.parse({ ...valid, name: '  Ковальчук О. І.  ' }).name).toBe(
      'Ковальчук О. І.'
    );
  });

  // Not just the ends. Stored with the runs left in, the ПІБ reads wrong
  // everywhere it is shown while still matching, because nameNormalised
  // collapses them — the worst kind of wrong, because nothing breaks.
  it('collapses runs of whitespace inside the ПІБ', () => {
    expect(
      admittedStudentSchema.parse({ ...valid, name: ' Ковальчук   Олена\tІгорівна ' }).name
    ).toBe('Ковальчук Олена Ігорівна');
  });

  it('refuses a ПІБ too short to be one', () => {
    expect(admittedStudentSchema.safeParse({ ...valid, name: 'О' }).success).toBe(false);
  });

  it('refuses an empty спеціальність', () => {
    expect(admittedStudentSchema.safeParse({ ...valid, specialityId: '' }).success).toBe(false);
  });

  it('refuses a ступінь that is not one of the two', () => {
    expect(admittedStudentSchema.safeParse({ ...valid, degree: 'PHD' }).success).toBe(false);
  });

  it('refuses a year outside the campaigns this system covers', () => {
    expect(admittedStudentSchema.safeParse({ ...valid, year: '1999' }).success).toBe(false);
    expect(admittedStudentSchema.safeParse({ ...valid, year: '2100' }).success).toBe(true);
    expect(admittedStudentSchema.safeParse({ ...valid, year: '2101' }).success).toBe(false);
  });
});

// The importer strips a digit out of a ПІБ; a form says so instead. One is a
// pasted column nobody wants to hand-edit, the other is a person who can fix it.
describe('admittedStudentSchema — digits in a ПІБ', () => {
  it('refuses a name with a birth date in it', () => {
    const result = admittedStudentSchema.safeParse({
      ...valid,
      name: 'Бедій Валерія Миколаївна 16.05.1985',
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toBe('ПІБ не може містити цифр');
  });

  it('still accepts the dots of initials', () => {
    expect(admittedStudentSchema.parse({ ...valid, name: 'Петренко О.І.' }).name).toBe(
      'Петренко О.І.'
    );
  });
});
