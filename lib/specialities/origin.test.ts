import { describe, expect, it } from 'vitest';
import { knowsDepartment, originOf, type SpecialityOwners } from './origin';

// «Психологія» is taught by two кафедри — one of the six that are, which is why
// the value is a list and not a single id.
const owners: SpecialityOwners = new Map([
  ['Економіка', ['dep-econ']],
  ['Психологія', ['dep-psy', 'dep-practical-psy']],
  ['Ветеринарна медицина', []],
]);

describe('originOf', () => {
  it('is own when the кафедра graduates that спеціальність', () => {
    expect(originOf(owners, 'Економіка', 'dep-econ')).toBe('own');
  });

  it('is own for either кафедра of a shared спеціальність', () => {
    expect(originOf(owners, 'Психологія', 'dep-psy')).toBe('own');
    expect(originOf(owners, 'Психологія', 'dep-practical-psy')).toBe('own');
  });

  it('is other when somebody else graduates it', () => {
    expect(originOf(owners, 'Психологія', 'dep-econ')).toBe('other');
  });

  // «We do not know», never «somebody else's» — telling a head their people
  // recruit for strangers is a claim we cannot support.
  it('is unknown for a спеціальність nobody is recorded as graduating', () => {
    expect(originOf(owners, 'Ветеринарна медицина', 'dep-econ')).toBe('unknown');
    expect(originOf(owners, 'Астрономія', 'dep-econ')).toBe('unknown');
  });

  it('is unknown for a кафедра that graduates nothing at all', () => {
    expect(originOf(owners, 'Економіка', 'dep-brand-new')).toBe('unknown');
  });
});

describe('knowsDepartment', () => {
  it('is true for a кафедра that graduates something', () => {
    expect(knowsDepartment(owners, 'dep-econ')).toBe(true);
    expect(knowsDepartment(owners, 'dep-practical-psy')).toBe(true);
  });

  it('is false for one that graduates nothing', () => {
    expect(knowsDepartment(owners, 'dep-brand-new')).toBe(false);
  });

  it('is false for an empty map', () => {
    expect(knowsDepartment(new Map(), 'dep-econ')).toBe(false);
  });
});
