import { describe, expect, it } from 'vitest';
import { positionFormSchema } from './kharakterystyka';

/** п.15's form, as the dialog builds it for the open 2026 window */
const p15 = positionFormSchema(15, 2022, 2026);

const complete = {
  year: 2026,
  group: null,
  option: 'olympiad_winner',
  stage: 'stage_3',
  event: 'Біологія',
  pupilLast: 'Коваленко',
  pupilFirst: 'Марія',
  pupilMiddle: 'Ігорівна',
  place: 'second',
};

const problem = (value: unknown) => {
  const result = p15.safeParse(value);
  return result.success ? null : result.error.issues[0].message;
};

describe('п.15 — every field is obligatory', () => {
  // Owner, 2026-09-14. The alternative was «required only for the керівництво
  // variants», since a juror names no pupil and wins no place — that was put
  // and declined. A журі row therefore also has to carry a ПІБ and a місце.
  it('accepts a complete row', () => {
    expect(problem(complete)).toBeNull();
  });

  it.each([
    ['pupilLast', 'Прізвище'],
    ['pupilFirst', 'Ім’я'],
    ['pupilMiddle', 'По батькові'],
    ['place', 'Призове місце'],
    ['event', 'Навчальний предмет'],
  ])('refuses a row with no %s', (field) => {
    expect(problem({ ...complete, [field]: '' })).not.toBeNull();
  });

  it('demands them on a журі row too', () => {
    // Recorded rather than assumed: this is the cost of the decision above, and
    // the test is where somebody will find it if it ever needs revisiting.
    expect(problem({ ...complete, option: 'olympiad_jury', pupilLast: '' })).not.toBeNull();
  });
});

describe('п.15 — a name is Ukrainian letters, at least two', () => {
  const named = (over: Record<string, string>) => problem({ ...complete, ...over });

  it('accepts ordinary names', () => {
    expect(named({ pupilLast: 'Коваленко' })).toBeNull();
    expect(named({ pupilFirst: 'Ія' })).toBeNull();
  });

  it('accepts an apostrophe and a hyphen', () => {
    // «Дем'янчук», «Кос-Анатольський» — both real, both refused by a
    // letters-only rule that forgets Ukrainian orthography. Both apostrophe
    // shapes, because a keyboard gives one and Word the other.
    expect(named({ pupilLast: "Дем'янчук" })).toBeNull();
    expect(named({ pupilLast: 'Дем’янчук' })).toBeNull();
    expect(named({ pupilLast: 'Кос-Анатольський' })).toBeNull();
  });

  it('refuses a single letter', () => {
    expect(named({ pupilFirst: 'М' })).not.toBeNull();
  });

  it('refuses latin letters, including one hiding inside', () => {
    expect(named({ pupilLast: 'Kovalenko' })).not.toBeNull();
    expect(named({ pupilLast: 'Ковaленко' })).not.toBeNull(); // latin «a»
  });

  it('refuses digits and punctuation', () => {
    expect(named({ pupilLast: 'Коваленко2' })).not.toBeNull();
    expect(named({ pupilLast: 'фів.' })).not.toBeNull();
  });
});

describe('п.20 — a period is one range, so it cannot run backwards', () => {
  const p20 = positionFormSchema(20, 2022, 2026);
  const row = {
    year: 2026,
    group: null,
    organization: 'ТОВ «Агросвіт»',
    jobTitle: 'Агроном',
    period: {
      from: `${new Date().getFullYear() - 5}-09-01`,
      to: `${new Date().getFullYear() - 1}-08-31`,
    },
  };
  const p20Problem = (value: unknown) => {
    const result = p20.safeParse(value);
    return result.success ? null : result.error.issues[0].message;
  };

  it('accepts a period in order', () => {
    expect(p20Problem(row)).toBeNull();
  });

  it('refuses an end before its start', () => {
    // The picker cannot produce this; the schema is what stops a request that
    // skips the picker.
    expect(
      p20Problem({
        ...row,
        period: {
          from: `${new Date().getFullYear() - 1}-08-31`,
          to: `${new Date().getFullYear() - 5}-09-01`,
        },
      })
    ).not.toBeNull();
  });

  it('refuses a half-picked period', () => {
    expect(
      p20Problem({ ...row, period: { from: `${new Date().getFullYear() - 5}-09-01` } })
    ).not.toBeNull();
  });

  it('refuses nonsense where a date belongs', () => {
    // 123123 saved before this and printed into a licence document as a year of
    // employment.
    expect(
      p20Problem({
        ...row,
        period: { from: '123123', to: `${new Date().getFullYear() - 1}-08-31` },
      })
    ).not.toBeNull();
  });

  it('allows a period running past today, for work somebody still does', () => {
    const ahead = `${new Date().getFullYear() + 5}-01-01`;
    expect(
      p20Problem({ ...row, period: { from: `${new Date().getFullYear() - 5}-09-01`, to: ahead } })
    ).toBeNull();
  });
});
