import { describe, expect, it } from 'vitest';
import { EMPTY_SELECTION, branchesOf, optionsFor, resolve, variantsOf } from './cascade';
import type { RegisterSpeciality } from './accepted';

/**
 * A register small enough to reason about, shaped like the real one.
 *
 * - «Філологія» — one unnamed branch, one variant. Everything settles at once.
 * - «Середня освіта» — two спеціалізації. «Географія» is offered four ways,
 *   «Історія» only денна/бюджет, and only as a бакалавр.
 * - «Психологія» — one branch taught by two кафедри, both ступені, денна only.
 */
const REGISTER: RegisterSpeciality[] = [
  {
    name: 'Філологія',
    code: 'B11',
    branches: [
      {
        name: null,
        speciality: 'Філологія',
        code: 'B11',
        departments: ['Кафедра української філології'],
        variants: [{ degree: 'BACHELOR', form: 'FULL_TIME', funding: 'STATE' }],
      },
    ],
  },
  {
    name: 'Середня освіта',
    code: 'A4',
    branches: [
      {
        name: 'Географія',
        speciality: 'Середня освіта (географія)',
        code: 'A4.07',
        departments: ['Кафедра географії'],
        variants: [
          { degree: 'BACHELOR', form: 'FULL_TIME', funding: 'STATE' },
          { degree: 'BACHELOR', form: 'FULL_TIME', funding: 'CONTRACT' },
          { degree: 'BACHELOR', form: 'PART_TIME', funding: 'CONTRACT' },
          { degree: 'MASTER', form: 'FULL_TIME', funding: 'STATE' },
        ],
      },
      {
        name: 'Історія',
        speciality: 'Середня освіта (історія)',
        code: 'A4.03',
        departments: ['Кафедра історії'],
        variants: [{ degree: 'BACHELOR', form: 'FULL_TIME', funding: 'STATE' }],
      },
    ],
  },
  {
    name: 'Психологія',
    code: 'B5',
    branches: [
      {
        name: null,
        speciality: 'Психологія',
        code: 'B5',
        departments: ['Кафедра психології', 'Кафедра спеціальної освіти'],
        variants: [
          { degree: 'BACHELOR', form: 'FULL_TIME', funding: 'STATE' },
          { degree: 'MASTER', form: 'FULL_TIME', funding: 'CONTRACT' },
        ],
      },
    ],
  },
];

const pick = (speciality: string, rest: Partial<typeof EMPTY_SELECTION> = {}) =>
  resolve(REGISTER, { ...EMPTY_SELECTION, speciality, ...rest });

describe('branchesOf', () => {
  it('gives a speciality its branches', () => {
    expect(branchesOf(REGISTER, 'Середня освіта')).toHaveLength(2);
  });

  it('gives nothing for a speciality that is not in the register', () => {
    expect(branchesOf(REGISTER, 'Богослів’я')).toEqual([]);
  });
});

describe('variantsOf', () => {
  it('gives the variants of one branch', () => {
    expect(variantsOf(REGISTER, 'Середня освіта', 'Середня освіта (географія)')).toHaveLength(4);
  });

  it('gives nothing for a branch the speciality does not have', () => {
    expect(variantsOf(REGISTER, 'Середня освіта', 'Філологія')).toEqual([]);
  });
});

describe('optionsFor', () => {
  const geography = variantsOf(REGISTER, 'Середня освіта', 'Середня освіта (географія)');
  const nothingChosen = { ...EMPTY_SELECTION, speciality: 'Середня освіта' };

  it('offers every value a term still has, with nothing else chosen', () => {
    expect(optionsFor(geography, nothingChosen, 'degree')).toEqual(['BACHELOR', 'MASTER']);
    expect(optionsFor(geography, nothingChosen, 'form')).toEqual(['FULL_TIME', 'PART_TIME']);
    expect(optionsFor(geography, nothingChosen, 'funding')).toEqual(['STATE', 'CONTRACT']);
  });

  it('narrows a term by what the other two already say', () => {
    // Заочна is offered on контракт only.
    const partTime = { ...nothingChosen, form: 'PART_TIME' };
    expect(optionsFor(geography, partTime, 'funding')).toEqual(['CONTRACT']);
  });

  it('ignores the term being asked about, so a chosen value never hides its siblings', () => {
    // Already on STATE — «which funding could I pick» must still offer both.
    const state = { ...nothingChosen, funding: 'STATE' };
    expect(optionsFor(geography, state, 'funding')).toEqual(['STATE', 'CONTRACT']);
  });

  it('offers a магістр only where one was admitted', () => {
    const contract = { ...nothingChosen, funding: 'CONTRACT' };
    expect(optionsFor(geography, contract, 'degree')).toEqual(['BACHELOR']);
  });
});

describe('resolve', () => {
  it('settles a speciality that has one branch and one variant entirely', () => {
    expect(pick('Філологія')).toEqual({
      speciality: 'Філологія',
      branch: 'Філологія',
      degree: 'BACHELOR',
      form: 'FULL_TIME',
      funding: 'STATE',
    });
  });

  it('picks a lone branch without asking, but leaves a real choice open', () => {
    // Психологія has one branch and two degrees — the branch fills in, the
    // degree does not, and форма settles because both variants are денна.
    expect(pick('Психологія')).toEqual({
      speciality: 'Психологія',
      branch: 'Психологія',
      degree: '',
      form: 'FULL_TIME',
      funding: '',
    });
  });

  it('asks for the спеціалізація when there is more than one', () => {
    expect(pick('Середня освіта')).toEqual({ ...EMPTY_SELECTION, speciality: 'Середня освіта' });
  });

  it('keeps settling until nothing more settles', () => {
    // Заочна географія exists on контракт only, and only for a бакалавр — so
    // one choice settles the other two, which is the cascade `resolve` runs for.
    expect(
      pick('Середня освіта', { branch: 'Середня освіта (географія)', form: 'PART_TIME' })
    ).toEqual({
      speciality: 'Середня освіта',
      branch: 'Середня освіта (географія)',
      degree: 'BACHELOR',
      form: 'PART_TIME',
      funding: 'CONTRACT',
    });
  });

  it('leaves a genuinely open combination open', () => {
    expect(pick('Середня освіта', { branch: 'Середня освіта (географія)' })).toEqual({
      speciality: 'Середня освіта',
      branch: 'Середня освіта (географія)',
      degree: '',
      form: '',
      funding: '',
    });
  });

  it('clears the terms when the speciality has no branch chosen yet', () => {
    const stale = { ...EMPTY_SELECTION, speciality: 'Середня освіта', degree: 'MASTER' };
    expect(resolve(REGISTER, stale)).toEqual({ ...EMPTY_SELECTION, speciality: 'Середня освіта' });
  });

  it('returns an empty selection for a speciality the register does not have', () => {
    expect(pick('Богослів’я')).toEqual({ ...EMPTY_SELECTION, speciality: 'Богослів’я' });
  });
});
