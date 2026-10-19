import { describe, expect, it } from 'vitest';
import { ratingGate, ratingGateDetail, type GatingType } from './rating-gate';

const m51: GatingType = { id: 't51', itemNumber: '5.1', sectionNumber: 5 };

describe('ratingGate', () => {
  it('is open in a year with no gating indicator', () => {
    expect(ratingGate({ gatingTypes: [], filledTypeIds: new Set() })).toEqual({ open: true });
  });

  it('is closed until the gating indicator has an entry', () => {
    expect(ratingGate({ gatingTypes: [m51], filledTypeIds: new Set() })).toEqual({
      open: false,
      missing: [m51],
    });
    expect(ratingGate({ gatingTypes: [m51], filledTypeIds: new Set(['t51']) })).toEqual({
      open: true,
    });
  });

  it('with several gating indicators needs each of them', () => {
    const other: GatingType = { id: 't52', itemNumber: '5.2', sectionNumber: 5 };
    const gate = ratingGate({ gatingTypes: [m51, other], filledTypeIds: new Set(['t51']) });
    expect(gate).toEqual({ open: false, missing: [other] });
  });
});

describe('ratingGateDetail', () => {
  it('says what happens to the year without the item', () => {
    expect(ratingGateDetail([m51])).toBe(
      'П. 5.1 обов’язковий: якщо не заповнити до закриття рейтингового року, ' +
        'бали за всі інші пункти не буде зараховано.'
    );
  });

  it('names every missing item when several are', () => {
    expect(ratingGateDetail([m51, { id: 'x', itemNumber: '5.2', sectionNumber: 5 }])).toContain(
      'Пункти 5.1, 5.2 обов’язкові'
    );
  });
});
