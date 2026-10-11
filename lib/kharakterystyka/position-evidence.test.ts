import { describe, expect, it } from 'vitest';
import { LICENCE_POSITIONS } from './positions';
import {
  defenceProblem,
  hasPeriodField,
  positionEvidenceFields,
  positionRowProblem,
  rowYear,
  yearFromPeriod,
  yearIsDerived,
} from './position-evidence';
import { summarizeEvidence } from '@/lib/rating/evidence-fields';
import { schemaForFields } from '@/validations/activity-evidence';
import { positionEvidenceProblems, RESERVED_FORM_NAMES } from '@/validations/kharakterystyka';

// These specs decide what a licence document asserts, and nothing in the app
// stops somebody adding a field named `year` or two fields called `title`. The
// admin screen that guards an indicator's spec has no counterpart here — the
// twenty positions are the law's and live in code — so this file is the guard.

const FILLABLE = LICENCE_POSITIONS.filter((p) => p.fill !== 'NOT_APPLICABLE');
const MILITARY = LICENCE_POSITIONS.filter((p) => p.fill === 'NOT_APPLICABLE');

describe('every position that can be typed has a form', () => {
  it.each(FILLABLE.map((p) => p.number))('п.%i asks for something', (number) => {
    expect(positionEvidenceFields(number).length).toBeGreaterThan(0);
  });

  // «Для вищих військових навчальних закладів» — a row here would be a claim
  // this university may not make, so there is nothing to offer.
  it.each(MILITARY.map((p) => p.number))('п.%i offers no form at all', (number) => {
    expect(positionEvidenceFields(number)).toHaveLength(0);
  });
});

describe('the specs hold together', () => {
  it.each(LICENCE_POSITIONS.map((p) => p.number))('п.%i has no spec problems', (number) => {
    expect(positionEvidenceProblems(number)).toEqual([]);
  });

  // The form is flat so the shared renderer can register each field under its
  // own name. A field called `year` would overwrite the row's own — the one
  // deciding whether it falls inside the five-year window at all.
  it('no field takes a name the form owns', () => {
    for (const position of LICENCE_POSITIONS) {
      const names = positionEvidenceFields(position.number).map((f) => f.name);
      for (const reserved of RESERVED_FORM_NAMES) {
        expect(names).not.toContain(reserved);
      }
    }
  });

  it('every field is answerable — a select is never optional', () => {
    for (const position of LICENCE_POSITIONS) {
      for (const field of positionEvidenceFields(position.number)) {
        // `select` carries no optional mode, so one nobody can answer would
        // block the whole form. Anything that varies is optional text instead.
        if (field.kind === 'select') expect(field.options.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('a filled form produces a printable sentence', () => {
  // The generated text IS the row's evidence — an empty one would print a blank
  // cell against a position claimed as met.
  it.each(FILLABLE.map((p) => p.number))('п.%i summarises its required fields', (number) => {
    const fields = positionEvidenceFields(number);
    const answers = Object.fromEntries(
      fields.map((f) => {
        switch (f.kind) {
          case 'select':
            return [f.name, f.options[0].value];
          case 'number':
            return [f.name, 2024];
          case 'date':
            return [f.name, '2024-05-01'];
          case 'dateRange':
            return [
              f.name,
              {
                from: `${new Date().getFullYear() - 5}-09-01`,
                to: `${new Date().getFullYear() - 1}-05-01`,
              },
            ];
          case 'url':
            return [f.name, 'https://example.org/1'];
          case 'isbn':
            return [f.name, '978-3-16-148410-0'];
          default:
            // A field with a named rule needs a value that satisfies it — a
            // ПІБ box takes Ukrainian letters only, so the generic
            // «Значення pupilLast» is not a plausible answer for it.
            return [
              f.name,
              f.kind === 'text' && f.rule === 'cyrillicName' ? 'Коваленко' : `Значення ${f.name}`,
            ];
        }
      })
    );

    expect(schemaForFields(fields).safeParse(answers).success).toBe(true);
    expect(summarizeEvidence(fields, answers, Infinity).trim()).not.toBe('');
  });

  // Optional fields left blank must drop out rather than print as empty parts —
  // (see below). A period replaces the «Рік» (owner, 2026-10-10).
  it('asks for a period, not a year, on п.11, п.19 and п.20', () => {
    for (const p of [11, 19, 20]) {
      expect(hasPeriodField(positionEvidenceFields(p))).toBe(true);
    }
    expect(hasPeriodField(positionEvidenceFields(15))).toBe(false);
  });

  it('takes the row’s year from where the period ends, kept inside the window', () => {
    const fields = positionEvidenceFields(20);
    const year = (to: string) =>
      yearFromPeriod(fields, { period: { from: '2010-09-01', to } }, 2022, 2026);
    expect(year('2025-06-30')).toBe(2025);
    expect(year('2012-06-30')).toBe(2022); // ended before the window
    expect(year('2031-06-30')).toBe(2026); // still running
    expect(yearFromPeriod(positionEvidenceFields(19), { period: '' }, 2022, 2026)).toBeNull();
  });

  // a document reading «Біологія ·  · » is worse than one that stops early.
  it('leaves out what nobody answered', () => {
    const fields = positionEvidenceFields(15);
    const text = summarizeEvidence(
      fields,
      { option: 'olympiad_jury', stage: 'stage_3', event: 'Біологія', pupil: '', place: '' },
      Infinity
    );
    expect(text).toContain('Біологія');
    expect(text).not.toMatch(/·\s*·/);
    expect(text.trim().endsWith('·')).toBe(false);
  });
});

// «не менше трьох років» accepted a single month (owner, 2026-10-12): the text of
// a position sets a bar that no single field can say.
describe('positionRowProblem — what the position’s own text asks', () => {
  const period = (from: string, to: string) => ({ period: { from, to } });

  it('п.11 wants three years, the end day counting', () => {
    expect(positionRowProblem(11, period('2026-10-01', '2026-10-30'))).toMatchObject({
      path: 'period',
    });
    expect(positionRowProblem(11, period('2023-10-01', '2026-09-29'))).not.toBeNull();
    expect(positionRowProblem(11, period('2023-10-01', '2026-09-30'))).toBeNull();
    expect(positionRowProblem(11, period('2020-01-01', '2026-01-01'))).toBeNull();
  });

  it('п.20 wants five', () => {
    expect(positionRowProblem(20, period('2021-10-01', '2026-09-29'))).not.toBeNull();
    expect(positionRowProblem(20, period('2021-10-01', '2026-09-30'))).toBeNull();
  });

  it('п.19 sets no length, and an empty period is not judged', () => {
    expect(positionRowProblem(19, period('2026-10-01', '2026-10-02'))).toBeNull();
    expect(positionRowProblem(11, {})).toBeNull();
  });

  it('п.3 judges the volume only when pages are given', () => {
    expect(positionRowProblem(3, { pages: 100 })).toMatchObject({ path: 'pages' }); // 4,2 арк.
    expect(positionRowProblem(3, { pages: 120 })).toBeNull(); // exactly 5
    expect(positionRowProblem(3, {})).toBeNull();
    // 5 sheets between 4 people is 1,25 each
    expect(positionRowProblem(3, { pages: 120, coAuthors: 4 })).toMatchObject({
      path: 'coAuthors',
    });
    expect(positionRowProblem(3, { pages: 240, coAuthors: 4 })).toBeNull(); // 2,5 each
  });

  it('п.13 asks the licence’s 50 hours, not the rating’s 30', () => {
    const schema = schemaForFields(positionEvidenceFields(13));
    const row = { discipline: 'Фізика', language: 'англійська' };
    expect(schema.safeParse({ ...row, hours: 49 }).success).toBe(false);
    expect(schema.safeParse({ ...row, hours: 50 }).success).toBe(true);
  });
});

// п.5 turns on the defence falling in the window — so the year IS the date
// (owner, 2026-10-12), and a date outside the window is refused rather than
// pulled in.
describe('п.5 — the defence date is the year', () => {
  const fields = positionEvidenceFields(5);

  it('has no «Рік» box of its own, like the positions with a period', () => {
    expect(yearIsDerived(5, fields)).toBe(true);
    expect(yearIsDerived(20, positionEvidenceFields(20))).toBe(true);
    expect(yearIsDerived(15, positionEvidenceFields(15))).toBe(false);
  });

  it('takes the row’s year from the date', () => {
    expect(rowYear(5, fields, { date: '2024-03-15' }, 2022, 2026)).toBe(2024);
    expect(rowYear(5, fields, { date: '' }, 2022, 2026)).toBeNull();
  });

  it('refuses a defence outside the window, naming the date', () => {
    expect(defenceProblem(5, { date: '2024-03-15' }, 2022, 2026)).toBeNull();
    expect(defenceProblem(5, { date: '2010-03-15' }, 2022, 2026)).toMatchObject({ path: 'date' });
    expect(defenceProblem(5, { date: '2031-03-15' }, 2022, 2026)).not.toBeNull();
    expect(defenceProblem(20, { date: '2010-03-15' }, 2022, 2026)).toBeNull(); // not п.5
  });
});

describe('п.3 — the volume cannot be skipped (owner, 2026-10-12)', () => {
  const schema = schemaForFields(positionEvidenceFields(3));
  const book = { option: 'monograph', bibliography: 'Іваненко І. Монографія. Київ, 2024.' };

  it('refuses a row with no pages, and accepts one with', () => {
    expect(schema.safeParse(book).success).toBe(false);
    expect(schema.safeParse({ ...book, pages: 200 }).success).toBe(true);
  });

  it('keeps co-authors optional — empty is a sole author', () => {
    expect(schema.safeParse({ ...book, pages: 200, coAuthors: '' }).success).toBe(true);
  });
});
