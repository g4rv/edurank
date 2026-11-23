import { describe, expect, it } from 'vitest';
import { uniqueDisciplines } from '@/lib/disciplines/assigned';
import {
  evaluateGate,
  ratingGate,
  ratingGateDetail,
  type GatingRow,
  type GatingType,
} from './rating-gate';
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

describe('evaluateGate', () => {
  const row: GatingRow = { id: 't51', itemNumber: '5.1', sectionNumber: 5, byDiscipline: true };
  const assigned = uniqueDisciplines(['Фізика', 'Хімія']);
  const entries = (...e: unknown[]) => new Map([['t51', e]]);

  it('without a list one entry opens it, as before', () => {
    expect(
      evaluateGate({ gating: [row], assigned: [], entries: entries({ isLecturer: false }) })
    ).toEqual({ open: true });
    expect(evaluateGate({ gating: [row], assigned: [], entries: entries() }).open).toBe(false);
  });

  it('with a list one entry is not enough — every discipline needs its own', () => {
    const gate = evaluateGate({
      gating: [row],
      assigned,
      entries: entries({ discipline: 'Фізика', isLecturer: true }),
    });
    expect(gate).toMatchObject({ open: false, missingDisciplines: ['Хімія'] });
  });

  it('«Не лектор» on each discipline opens it', () => {
    const gate = evaluateGate({
      gating: [row],
      assigned,
      entries: entries(
        { discipline: 'Фізика', isLecturer: false },
        { discipline: 'Хімія', isLecturer: false }
      ),
    });
    expect(gate).toEqual({ open: true });
  });

  it('a gating indicator that asks for no discipline keeps the one-entry rule even with a list', () => {
    const plain: GatingRow = { ...row, id: 't52', itemNumber: '5.2', byDiscipline: false };
    const gate = evaluateGate({ gating: [plain], assigned, entries: new Map([['t52', [{}]]]) });
    expect(gate).toEqual({ open: true });
  });
});
