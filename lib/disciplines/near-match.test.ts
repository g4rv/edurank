import { describe, expect, it } from 'vitest';
import { nameSimilarity, pairNearMatches } from './near-match';

describe('nameSimilarity', () => {
  it('ignores case, spaces and quotes', () => {
    expect(nameSimilarity('Психологія', ' психологія ')).toBe(1);
    expect(nameSimilarity('«Психологія»', 'Психологія')).toBe(1);
  });

  it('scores a one-letter slip high and another course low', () => {
    expect(
      nameSimilarity('Практичний курс німецької мови', 'Практичний курс німмецької мови')
    ).toBeGreaterThan(0.95);
    expect(
      nameSimilarity('Основи медичних знань', 'Валеологія й основи медичних знань')
    ).toBeLessThan(0.7);
  });
});

describe('pairNearMatches', () => {
  it('pairs a typo with the assigned name', () => {
    const r = pairNearMatches(
      [{ name: 'Вступ до спеціальності (фаху)' }],
      [{ id: 'a', name: 'Вступ до спеціальності (фвху)' }],
      0.85
    );
    expect(r.pairs.map((p) => p.entryId)).toEqual(['a']);
    expect(r.ambiguous).toEqual([]);
  });

  it('leaves an entry that is too different alone', () => {
    const r = pairNearMatches(
      [{ name: 'Основи медичних знань' }],
      [{ id: 'a', name: 'Валеологія й основи медичних знань' }],
      0.85
    );
    expect(r.pairs).toEqual([]);
  });

  it('refuses a pair when two entries are about as close', () => {
    const r = pairNearMatches(
      [{ name: 'Історія зарубіжної літератури (реалізм)' }],
      [
        { id: 'a', name: 'Історія зарубіжної літератури (реалізм)  ' + 'x' },
        { id: 'b', name: 'Історія зарубіжної літератури (реалізм) y' },
      ],
      0.85
    );
    expect(r.pairs).toEqual([]);
    expect(r.ambiguous).toHaveLength(2);
  });

  it('refuses one entry claimed by two assigned names', () => {
    const r = pairNearMatches(
      [{ name: 'Теорія і методика футболу' }, { name: 'Теорія і методика футзалу' }],
      [{ id: 'a', name: 'Теорія і методика футболу' + '.' + ' ' }],
      0.8
    );
    // the exact-ish one is far ahead of the other, so only it is taken
    expect(r.pairs.map((p) => p.missing)).toEqual(['Теорія і методика футболу']);
  });
});

describe('pairNearMatches with a duplicated entry', () => {
  it('takes the first of two identical entries and leaves the twin', () => {
    const r = pairNearMatches(
      [{ name: 'Гра у закладах: цілісний погляд' }],
      [
        { id: 'a', name: 'Гра у закладах : цілісний погляд' },
        { id: 'b', name: 'Гра у закладах : цілісний погляд' },
      ],
      0.85
    );
    expect(r.pairs.map((p) => p.entryId)).toEqual(['a']);
    expect(r.ambiguous).toEqual([]);
  });
});

describe('pairNearMatches holds back a name that only adds words', () => {
  it('does not rename «… мови» to «… мови д.ф.» — another form of study, perhaps', () => {
    const r = pairNearMatches(
      [{ name: 'Практична граматика англійської мови д.ф.' }],
      [{ id: 'a', name: 'Практична граматика англійської мови' }],
      0.85
    );
    expect(r.pairs).toEqual([]);
    expect(r.ambiguous.map((p) => p.reason)).toEqual(['extends']);
  });

  it('does not rename a group-coded entry to the bare name', () => {
    const r = pairNearMatches(
      [{ name: 'Охорона праці в галузі. Цивільний захист' }],
      [{ id: 'a', name: 'М-1пм Охорона праці в галузі. Цивільний захист' }],
      0.8
    );
    expect(r.pairs).toEqual([]);
    expect(r.ambiguous[0].reason).toBe('extends');
  });

  it('still renames a plain slip', () => {
    const r = pairNearMatches(
      [{ name: 'Практичний курс німецької мови' }],
      [{ id: 'a', name: 'Практичний курс німмецької мови' }],
      0.85
    );
    expect(r.pairs).toHaveLength(1);
  });
});

describe('the «adds words» check compares whole words', () => {
  it('renames a changed ending — «підприємств» is not inside «підприємства»', () => {
    const r = pairNearMatches(
      [{ name: 'Звітність підприємств' }],
      [{ id: 'a', name: 'Звітність підприємства' }],
      0.85
    );
    expect(r.pairs).toHaveLength(1);
  });
});
