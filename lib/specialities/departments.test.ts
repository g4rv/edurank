import { describe, expect, it } from 'vitest';
import { SPECIALITY_NORMS_2026 } from '@/lib/stake/norms';
import {
  SPECIALITY_DEPARTMENTS,
  isKnownDepartment,
  normaliseDepartmentName,
  specialitiesOf,
  specialityOrigin,
} from './departments';

const seeded = SPECIALITY_NORMS_2026.map(([name]) => name);

// The map is keyed by the speciality NAME, and a key that does not match the
// seeded name byte for byte simply never resolves — every chip goes gray and
// nothing says why. The apostrophe in «здоров’я» is the real hazard: the HTML
// this was transcribed from writes it as a plain quote. So both directions are
// pinned, the same way `codes.test.ts` pins the code table.
describe('SPECIALITY_DEPARTMENTS covers exactly the seeded specialities', () => {
  it('has no key that is not a seeded speciality', () => {
    const unknown = Object.keys(SPECIALITY_DEPARTMENTS).filter((name) => !seeded.includes(name));
    expect(unknown).toEqual([]);
  });

  it('has a key for every seeded speciality', () => {
    const missing = seeded.filter((name) => !(name in SPECIALITY_DEPARTMENTS));
    expect(missing).toEqual([]);
  });

  it('gives every speciality at least one кафедра', () => {
    const empty = Object.entries(SPECIALITY_DEPARTMENTS)
      .filter(([, owners]) => owners.length === 0)
      .map(([name]) => name);
    expect(empty).toEqual([]);
  });
});

// One кафедра written two ways is the failure that would silently split a
// кафедра in half: half its specialities green, half amber, with nothing on
// screen to suggest a typo.
it('spells each кафедра one way only', () => {
  const byNormalised = new Map<string, Set<string>>();
  for (const owners of Object.values(SPECIALITY_DEPARTMENTS)) {
    for (const name of owners) {
      const key = normaliseDepartmentName(name);
      const set = byNormalised.get(key) ?? new Set<string>();
      set.add(name);
      byNormalised.set(key, set);
    }
  }
  const duplicated = [...byNormalised.values()]
    .filter((set) => set.size > 1)
    .map((set) => [...set]);
  expect(duplicated).toEqual([]);
});

describe('normaliseDepartmentName', () => {
  it('folds case, spacing and the word «кафедра»', () => {
    expect(normaliseDepartmentName('  Кафедра   Економіки ')).toBe('економіки');
    expect(normaliseDepartmentName('Економіки')).toBe('економіки');
  });

  it('folds apostrophe variants', () => {
    expect(normaliseDepartmentName("Кафедра здоров'я і безпеки життєдіяльності")).toBe(
      normaliseDepartmentName('Кафедра здоров’я і безпеки життєдіяльності')
    );
  });
});

describe('specialityOrigin', () => {
  it('is own for a кафедра that graduates the speciality', () => {
    expect(specialityOrigin('Кафедра економіки', 'Економіка')).toBe('own');
  });

  it('is own for any of a speciality’s several випускові кафедри', () => {
    expect(specialityOrigin('Кафедра психології', 'Психологія')).toBe('own');
    expect(specialityOrigin('Кафедра практичної психології', 'Психологія')).toBe('own');
  });

  it('is other for a кафедра in the довідник that does not graduate it', () => {
    expect(specialityOrigin('Кафедра економіки', 'Психологія')).toBe('other');
  });

  // Not `other`. The demo dataset invents кафедри, and so will any university
  // that reorganises before this file is updated — reporting those as somebody
  // else's programme is a claim we cannot support.
  it('is unknown for a кафедра the довідник has never heard of', () => {
    expect(specialityOrigin('Кафедра кібербезпеки', 'Економіка')).toBe('unknown');
  });

  it('is unknown for a speciality the map does not carry', () => {
    expect(specialityOrigin('Кафедра економіки', 'Ветеринарна медицина')).toBe('unknown');
  });
});

describe('specialitiesOf', () => {
  it('finds every speciality a кафедра graduates', () => {
    expect(specialitiesOf('Кафедра професійної освіти').sort()).toEqual(
      [
        'Професійна освіта (товарознавство)',
        'Професійна освіта (сфера обслуговування)',
        'Туризм і рекреація',
      ].sort()
    );
  });

  it('is empty for a кафедра outside the довідник', () => {
    expect(specialitiesOf('Кафедра кібербезпеки')).toEqual([]);
  });
});

it('isKnownDepartment ignores the word «кафедра» and spacing', () => {
  expect(isKnownDepartment('Кафедра  Фінансів')).toBe(true);
  expect(isKnownDepartment('фінансів')).toBe(true);
  expect(isKnownDepartment('Кафедра вищої математики')).toBe(false);
});
