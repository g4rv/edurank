import { describe, expect, it } from 'vitest';
import { fullStaffName, shortStaffName } from './staff-name';

describe('shortStaffName', () => {
  it('keeps the surname and initialises the rest', () => {
    expect(
      shortStaffName({ lastName: 'Бойко', firstName: 'Катерина', patronymic: 'Володимирівна' })
    ).toBe('Бойко К. В.');
  });

  // A non-НПП or an imported row can arrive without one, and «Бойко К. .» is
  // worse than no initial at all.
  it('drops a missing patronymic instead of printing a bare dot', () => {
    expect(shortStaffName({ lastName: 'Бойко', firstName: 'Катерина', patronymic: '' })).toBe(
      'Бойко К.'
    );
  });

  it('falls back to the surname alone', () => {
    expect(shortStaffName({ lastName: 'Бойко', firstName: '', patronymic: '' })).toBe('Бойко');
  });

  // Splitting a joined string on spaces would make this «Карпенко-К. К.»
  it('leaves a double-barrelled surname whole', () => {
    expect(
      shortStaffName({ lastName: 'Карпенко-Карий', firstName: 'Іван', patronymic: 'Карпович' })
    ).toBe('Карпенко-Карий І. К.');
  });

  it('uppercases an initial that was typed in lower case', () => {
    expect(shortStaffName({ lastName: 'Бойко', firstName: 'катерина', patronymic: '' })).toBe(
      'Бойко К.'
    );
  });
});

describe('fullStaffName', () => {
  it('joins the three parts', () => {
    expect(
      fullStaffName({ lastName: 'Бойко', firstName: 'Катерина', patronymic: 'Володимирівна' })
    ).toBe('Бойко Катерина Володимирівна');
  });

  it('leaves no double space when the patronymic is missing', () => {
    expect(fullStaffName({ lastName: 'Бойко', firstName: 'Катерина', patronymic: '' })).toBe(
      'Бойко Катерина'
    );
  });
});
