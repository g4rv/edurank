import { describe, expect, it } from 'vitest';
import { positionFormSchema } from './kharakterystyka';

/** п.15's form, as the dialog builds it for the open 2026 window */
const p15 = positionFormSchema(15, 2022, 2026);

const jury = {
  year: 2026,
  group: null,
  option: 'olympiad_jury',
  stage: 'stage_3',
  event: 'Біологія',
  pupilLast: '',
  pupilFirst: '',
  pupilMiddle: '',
  place: '',
};

const led = {
  ...jury,
  option: 'olympiad_winner',
  pupilLast: 'Коваленко',
  pupilFirst: 'Марія',
  pupilMiddle: 'Ігорівна',
  place: 'second',
};

const problem = (value: unknown) => {
  const result = p15.safeParse(value);
  return result.success ? null : result.error.issues[0].message;
};

describe('п.15 — a пупіл and a place are required only where they exist', () => {
  it('accepts a complete керівництво row', () => {
    expect(problem(led)).toBeNull();
  });

  it('refuses керівництво with no школяр named', () => {
    expect(problem({ ...led, pupilLast: '', pupilFirst: '', pupilMiddle: '' })).not.toBeNull();
  });

  it('refuses керівництво with no place', () => {
    expect(problem({ ...led, place: '' })).not.toBeNull();
  });

  it('accepts a журі row with neither', () => {
    // The положення's own п.15 covers both: «Керівництво школярем … ; участь у
    // журі …». Requiring a pupil here would make a legitimate row unfileable,
    // and the only way to save it would be to invent a name.
    expect(problem(jury)).toBeNull();
  });
});

describe('п.15 — a name is Ukrainian letters, at least two', () => {
  const named = (over: Record<string, string>) => problem({ ...led, ...over });

  it('accepts ordinary names', () => {
    expect(named({ pupilLast: 'Коваленко' })).toBeNull();
    expect(named({ pupilFirst: 'Ія' })).toBeNull();
  });

  it('accepts an apostrophe and a hyphen', () => {
    // «Дем'янчук», «Кос-Анатольський» — both real, both refused by a letters-only
    // rule that forgets Ukrainian orthography.
    expect(named({ pupilLast: "Дем'янчук" })).toBeNull();
    expect(named({ pupilLast: 'Кос-Анатольський' })).toBeNull();
    expect(named({ pupilLast: 'Дем’янчук' })).toBeNull();
  });

  it('refuses a single letter', () => {
    expect(named({ pupilFirst: 'М' })).not.toBeNull();
  });

  it('refuses latin letters', () => {
    // The document is Ukrainian; a latin «Kovalenko» in it is a transcription
    // nobody asked for.
    expect(named({ pupilLast: 'Kovalenko' })).not.toBeNull();
    expect(named({ pupilLast: 'Ковaленко' })).not.toBeNull(); // latin «a» hiding inside
  });

  it('refuses digits and punctuation', () => {
    expect(named({ pupilLast: 'Коваленко2' })).not.toBeNull();
    expect(named({ pupilLast: 'фів.' })).not.toBeNull();
  });
});
