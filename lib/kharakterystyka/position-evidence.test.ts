import { describe, expect, it } from 'vitest';
import { LICENCE_POSITIONS } from './positions';
import { positionEvidenceFields } from './position-evidence';
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
          case 'url':
            return [f.name, 'https://example.org/1'];
          case 'isbn':
            return [f.name, '978-3-16-148410-0'];
          default:
            return [f.name, `Значення ${f.name}`];
        }
      })
    );

    expect(schemaForFields(fields).safeParse(answers).success).toBe(true);
    expect(summarizeEvidence(fields, answers, Infinity).trim()).not.toBe('');
  });

  // Optional fields left blank must drop out rather than print as empty parts —
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
