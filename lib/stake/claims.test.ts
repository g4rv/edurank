import { describe, it, expect } from 'vitest';
import {
  bonusByStaff,
  claimValue,
  contestedCountByStaff,
  contestedKeys,
  duplicateKey,
  firstClaimIds,
  normaliseStudentName,
  type BonusClaim,
  type GroupableClaim,
} from './claims';

describe('normaliseStudentName', () => {
  it('folds case, trims and collapses spaces', () => {
    expect(normaliseStudentName('  Петренко   О.І.  ')).toBe('петренко о.і.');
  });

  it('treats the different apostrophes as one', () => {
    const forms = ["Дем'яненко", 'Дем’яненко', 'Демʼяненко', 'Дем`яненко'];
    const normalised = forms.map(normaliseStudentName);
    expect(new Set(normalised).size).toBe(1);
  });

  it('treats the different dashes as one', () => {
    expect(normaliseStudentName('Пархоменко-Куцевіл')).toBe(
      normaliseStudentName('Пархоменко–Куцевіл')
    );
  });

  it('matches the same name typed two ways', () => {
    expect(normaliseStudentName('Петренко  О.І.')).toBe(normaliseStudentName('петренко О.І.'));
  });

  it('does NOT guess that an initial is a full name', () => {
    // A wrong merge hides a real second claim, so near-misses stay separate
    expect(normaliseStudentName('Петренко О.')).not.toBe(normaliseStudentName('Петренко Олена'));
  });
});

describe('claimValue', () => {
  const base: BonusClaim = {
    staffId: 'a',
    status: 'CONFIRMED',
    degree: 'BACHELOR',
    form: 'FULL_TIME',
    funding: 'STATE',
    base: 10.5,
  };

  it('is the confirmed worked example', () => {
    expect(claimValue(base, 0.175)).toBeCloseTo(0.095, 3);
    expect(claimValue({ ...base, funding: 'CONTRACT' }, 0.175)).toBeCloseTo(0.017, 3);
  });

  it('pays nothing until the claim is confirmed', () => {
    expect(claimValue({ ...base, status: 'PENDING' }, 0.175)).toBe(0);
    expect(claimValue({ ...base, status: 'REJECTED' }, 0.175)).toBe(0);
  });

  it('pays nothing for a speciality with no норматив this year', () => {
    // Better a visible zero than a number nobody set
    expect(claimValue({ ...base, base: null }, 0.175)).toBe(0);
  });
});

describe('bonusByStaff', () => {
  const claim = (staffId: string, over: Partial<BonusClaim> = {}): BonusClaim => ({
    staffId,
    status: 'CONFIRMED',
    degree: 'BACHELOR',
    form: 'FULL_TIME',
    funding: 'STATE',
    base: 10,
    ...over,
  });

  it('adds a person’s students together', () => {
    const total = bonusByStaff([claim('a'), claim('a')], 0.175).get('a');
    expect(total).toBeCloseTo(0.2, 6);
  });

  it('keeps recruiters apart', () => {
    const totals = bonusByStaff([claim('a'), claim('b'), claim('b')], 0.175);
    expect(totals.get('a')).toBeCloseTo(0.1, 6);
    expect(totals.get('b')).toBeCloseTo(0.2, 6);
  });

  it('leaves out anybody whose claims are all unconfirmed', () => {
    const totals = bonusByStaff([claim('a', { status: 'PENDING' })], 0.175);
    expect(totals.has('a')).toBe(false);
  });

  it('rounds ONCE at the end, not per student', () => {
    // Three заочні контрактні at ~0.0004375 each. Rounded first they are worth
    // nothing at all; summed first they survive.
    const tiny = claim('a', { form: 'PART_TIME', funding: 'CONTRACT', base: 100 });
    const total = bonusByStaff([tiny, tiny, tiny], 0.175).get('a');
    expect(total).toBeGreaterThan(0);
  });

  it('rounds the total to three decimals', () => {
    const total = bonusByStaff([claim('a', { base: 10.5 })], 0.175).get('a');
    expect(total).toBe(0.095);
  });
});

describe('duplicates', () => {
  const at = (iso: string) => new Date(iso);
  const c = (
    id: string,
    staffId: string,
    name: string,
    over: Partial<GroupableClaim> = {}
  ): GroupableClaim => ({
    id,
    staffId,
    studentNameNormalised: name,
    specialityId: 'sp1',
    createdAt: at('2026-09-01T10:00:00Z'),
    status: 'PENDING',
    ...over,
  });

  it('finds a student claimed by two people', () => {
    const keys = contestedKeys([c('1', 'a', 'петренко о.'), c('2', 'b', 'петренко о.')]);
    expect(
      keys.has(duplicateKey({ studentNameNormalised: 'петренко о.', specialityId: 'sp1' }))
    ).toBe(true);
  });

  it('does not call one person’s single claim a duplicate', () => {
    expect(contestedKeys([c('1', 'a', 'петренко о.')]).size).toBe(0);
  });

  it('treats the same name on a different programme as a different claim', () => {
    const keys = contestedKeys([
      c('1', 'a', 'петренко о.'),
      c('2', 'b', 'петренко о.', { specialityId: 'sp2' }),
    ]);
    expect(keys.size).toBe(0);
  });

  it('stops counting a rejected claim as a conflict', () => {
    const keys = contestedKeys([
      c('1', 'a', 'петренко о.'),
      c('2', 'b', 'петренко о.', { status: 'REJECTED' }),
    ]);
    expect(keys.size).toBe(0);
  });

  it('marks who filed first', () => {
    const first = firstClaimIds([
      c('late', 'b', 'петренко о.', { createdAt: at('2026-09-05T10:00:00Z') }),
      c('early', 'a', 'петренко о.', { createdAt: at('2026-09-01T10:00:00Z') }),
    ]);
    expect(first.has('early')).toBe(true);
    expect(first.has('late')).toBe(false);
  });

  it('breaks an exact tie the same way every time', () => {
    const same = at('2026-09-01T10:00:00Z');
    const a = firstClaimIds([
      c('zzz', 'b', 'петренко о.', { createdAt: same }),
      c('aaa', 'a', 'петренко о.', { createdAt: same }),
    ]);
    const b = firstClaimIds([
      c('aaa', 'a', 'петренко о.', { createdAt: same }),
      c('zzz', 'b', 'петренко о.', { createdAt: same }),
    ]);
    expect([...a]).toEqual([...b]);
  });

  it('counts contested claims per person — the pattern, not the row', () => {
    const claims = [
      c('1', 'a', 'петренко о.'),
      c('2', 'b', 'петренко о.'),
      c('3', 'a', 'іваненко с.'),
      c('4', 'b', 'іваненко с.'),
      c('5', 'a', 'сидоренко м.'), // uncontested
    ];
    const counts = contestedCountByStaff(claims);
    // «two of this person's three claims are contested» is the useful sentence
    expect(counts.get('a')).toBe(2);
    expect(counts.get('b')).toBe(2);
  });

  it('counts nobody when nothing is contested', () => {
    expect(contestedCountByStaff([c('1', 'a', 'петренко о.')]).size).toBe(0);
  });
});
