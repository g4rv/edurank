import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACTIVITY_TYPES_2026 } from '@/lib/rating/activity-types';
import {
  date,
  dateRange,
  doi,
  EVIDENCE_FIELDS,
  isbn,
  number,
  opt,
  select,
  url,
  type EvidenceField,
} from '@/lib/rating/evidence-fields';
import { computeScore } from '@/lib/rating/scoring';
import { catalogueType, SELECT_OPTION_POINTS } from '@/lib/rating/db-specs';
import { currentYearBounds, fieldSchema, schemaForFields } from './activity-evidence';

// Schemas are built from an activity type's own field specs. Here they are
// built from the catalogue through `catalogueType`, the same conversion the
// seed writes into the DB — so these tests still cover the real 2026 forms.
const schemaFor = (code: string) => catalogueType(code).schema;

/** Score a catalogue code, optionally overriding its coefficient */
function score(code: string, evidence: unknown, coefficient?: number) {
  const type = catalogueType(code);
  return computeScore(coefficient === undefined ? type : { ...type, coefficient }, evidence);
}

/** The scored checkboxes of a check-sum type, off its own field specs */
const scoredCheckboxNames = (code: string) =>
  catalogueType(code)
    .evidenceFields.filter((f) => f.kind === 'checkbox' && f.points !== undefined)
    .map((f) => f.name);

const MOODLE_MATERIALS = scoredCheckboxNames('moodle_course');

/** Build a valid sample evidence object straight from the field specs */
function sampleEvidence(fields: readonly EvidenceField[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    switch (f.kind) {
      case 'text':
        out[f.name] = 'Тестове значення';
        break;
      case 'number':
        out[f.name] = Math.max(f.min ?? 0, 1);
        break;
      case 'url':
        // Host-restricted fields need a link on that service, not a placeholder
        out[f.name] = f.hosts ? `https://www.${f.hosts[0]}/record` : 'https://example.com/proof';
        break;
      case 'date':
        out[f.name] = '2026-06-15';
        break;
      case 'isbn':
        out[f.name] = '978-3-16-148410-0';
        break;
      case 'doi':
        out[f.name] = '10.1038/s41586-021-03819-2';
        break;
      case 'checkbox':
        out[f.name] = true;
        break;
      case 'select':
        out[f.name] = f.options[0].value;
        break;
    }
  }
  return out;
}

describe('catalogue ↔ evidence fields consistency', () => {
  it('every catalogue code has evidence fields, and no orphans exist', () => {
    const catalogueCodes = new Set(ACTIVITY_TYPES_2026.map((t) => t.code));
    for (const code of catalogueCodes) {
      expect(EVIDENCE_FIELDS, `missing evidence fields for ${code}`).toHaveProperty(code);
    }
    for (const code of Object.keys(EVIDENCE_FIELDS)) {
      expect(catalogueCodes.has(code), `orphan evidence fields: ${code}`).toBe(true);
    }
  });

  it('SELECT / SELECT_MULT option values exactly match SELECT_OPTION_POINTS keys', () => {
    for (const def of ACTIVITY_TYPES_2026) {
      if (def.kind !== 'SELECT' && def.kind !== 'SELECT_MULT') continue;
      const field = EVIDENCE_FIELDS[def.code].find(
        (f) => f.kind === 'select' && f.name === 'option'
      );
      expect(field, `${def.code}: no "option" select field`).toBeDefined();
      const values = (field as Extract<EvidenceField, { kind: 'select' }>).options
        .map((o) => o.value)
        .sort();
      const pointKeys = Object.keys(
        SELECT_OPTION_POINTS[def.code as keyof typeof SELECT_OPTION_POINTS]
      ).sort();
      expect(values, def.code).toEqual(pointKeys);
    }
  });

  it('scoring fields are present per kind (value / pages / credits / mode + materials)', () => {
    const names = (code: string) => EVIDENCE_FIELDS[code].map((f) => f.name);
    for (const def of ACTIVITY_TYPES_2026) {
      if (def.kind === 'MULT') {
        const n = names(def.code);
        expect(
          n.includes('value') || n.includes('pages'),
          `${def.code}: MULT needs value or pages`
        ).toBe(true);
      }
      if (def.code === 'intl_internship' || def.code === 'ukr_internship') {
        expect(names(def.code)).toContain('credits');
      }
      if (def.kind === 'CHECK_SUM') {
        const n = names(def.code);
        expect(n).toContain('mode');
        for (const m of MOODLE_MATERIALS) expect(n, `moodle missing ${m}`).toContain(m);
      }
    }
  });
});

describe('schema → scoring integration (all 67 types)', () => {
  it('sample evidence parses and computes a score for every type', () => {
    for (const def of ACTIVITY_TYPES_2026) {
      const schema = schemaFor(def.code);
      const parsed = schema.safeParse(sampleEvidence(EVIDENCE_FIELDS[def.code]));
      expect(parsed.success, `${def.code}: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);
      if (!parsed.success) continue;
      const result = score(def.code, parsed.data);
      expect(Number.isFinite(result.computedValue), def.code).toBe(true);
      expect(Number.isFinite(result.score), def.code).toBe(true);
      expect(result.score, def.code).toBeGreaterThanOrEqual(0);
    }
  });

  // Item 5.1 pays per material, so any subset scores — except the empty one.
  // Nothing ticked sums to 0, and a saved 0 would read as «Зараховано» beside
  // no points at all, so the schema refuses it while the engine still computes
  // it (computeScore is reachable from paths that skip the form).
  it('moodle full sample scores mode points', () => {
    const schema = schemaFor('moodle_course');
    const full = schema.parse(sampleEvidence(EVIDENCE_FIELDS.moodle_course));
    // «Розроблення» is the first mode option, which is what sampleEvidence picks
    expect(score('moodle_course', full).score).toBe(150);
  });

  it('moodle accepts a course missing a material — it is no longer all-or-nothing', () => {
    const schema = schemaFor('moodle_course');
    const full = sampleEvidence(EVIDENCE_FIELDS.moodle_course);

    for (const material of MOODLE_MATERIALS) {
      const result = schema.safeParse({ ...full, [material]: false });
      expect(result.success, material).toBe(true);
    }
  });

  it('an incomplete course scores the materials it does have', () => {
    const full = schemaFor('moodle_course').parse(sampleEvidence(EVIDENCE_FIELDS.moodle_course));
    // «Презентації» is worth 30 of the 150 available for розроблення
    expect(score('moodle_course', { ...full, presentations: false }).score).toBe(120);
  });

  it('refuses a course with no material ticked at all', () => {
    const schema = schemaFor('moodle_course');
    const none = { ...sampleEvidence(EVIDENCE_FIELDS.moodle_course) };
    for (const material of MOODLE_MATERIALS) none[material] = false;

    const result = schema.safeParse(none);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('хоча б один');
      // Lands on the first box so the grouped set shows one message
      expect(result.error.issues[0].path).toEqual([MOODLE_MATERIALS[0]]);
    }
  });

  it('accepts a course with a single material ticked', () => {
    const schema = schemaFor('moodle_course');
    for (const material of MOODLE_MATERIALS) {
      const one = { ...sampleEvidence(EVIDENCE_FIELDS.moodle_course) };
      for (const other of MOODLE_MATERIALS) one[other] = other === material;
      expect(schema.safeParse(one).success, material).toBe(true);
    }
  });
});

describe('schema validation behavior', () => {
  it('rejects missing required text', () => {
    const schema = schemaFor('prof_associations');
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ title: '   ' }).success).toBe(false);
    expect(schema.safeParse({ title: 'Спілка економістів' }).success).toBe(true);
  });

  it('rejects an option outside the list', () => {
    const schema = schemaFor('publication_cat_a');
    const ok = {
      option: 'q1',
      bibliography: 'Опис',
      link: 'https://www.scopus.com/record/display.uri?eid=2-s2.0-1',
    };
    expect(schema.safeParse(ok).success).toBe(true);
    expect(schema.safeParse({ ...ok, option: 'q5' }).success).toBe(false);
  });

  it('rejects unknown extra keys (strict)', () => {
    const schema = schemaFor('prof_associations');
    expect(schema.safeParse({ title: 'Спілка', hacked: 1 }).success).toBe(false);
  });

  it('rejects bad url and bad date, accepts empty optional fields', () => {
    const schema = schemaFor('conf_abroad');
    const base = { option: 'in_person', title: 'IEEE Conf' };
    expect(schema.safeParse(base).success).toBe(true);
    expect(schema.safeParse({ ...base, link: '' }).success).toBe(true);
    expect(schema.safeParse({ ...base, link: 'not-a-url' }).success).toBe(false);

    const patent = schemaFor('patent_granted');
    const okPatent = {
      patentKind: 'invention',
      date: '2026-03-01',
      registrationNumber: '12345',
      title: 'Пристрій',
    };
    expect(patent.safeParse(okPatent).success).toBe(true);
    expect(patent.safeParse({ ...okPatent, date: '01.03.2026' }).success).toBe(false);
  });

  it('rejects dates with out-of-range years', () => {
    const patent = schemaFor('patent_granted');
    const base = { patentKind: 'invention', registrationNumber: '12345', title: 'Пристрій' };
    const nextYear = new Date().getFullYear() + 1;
    expect(patent.safeParse({ ...base, date: '0002-03-01' }).success).toBe(false);
    expect(patent.safeParse({ ...base, date: '2300-03-01' }).success).toBe(false);
    expect(patent.safeParse({ ...base, date: '1949-12-31' }).success).toBe(false);
    expect(patent.safeParse({ ...base, date: `${nextYear}-12-31` }).success).toBe(true);
  });

  it('coerces numeric strings from form inputs', () => {
    const schema = schemaFor('monograph_ua');
    const parsed = schema.parse({
      pages: '120',
      coAuthors: '2',
      isbn: '978-3-16-148410-0',
      bibliography: 'Опис',
    });
    expect(parsed).toMatchObject({ pages: 120, coAuthors: 2 });
    expect(score('monograph_ua', parsed, 200)).toEqual({ computedValue: 2.5, score: 500 });
  });

  it('rejects an ISBN whose check digit does not match', () => {
    const schema = schemaFor('monograph_ua');
    const base = { pages: 120, coAuthors: 2, bibliography: 'Опис' };

    expect(schema.safeParse({ ...base, isbn: '978-3-16-148410-0' }).success).toBe(true);
    expect(schema.safeParse({ ...base, isbn: '9783161484100' }).success).toBe(true);
    expect(schema.safeParse({ ...base, isbn: '0-8044-2957-X' }).success).toBe(true);

    expect(schema.safeParse({ ...base, isbn: '978-3-16-148410-1' }).success).toBe(false);
    expect(schema.safeParse({ ...base, isbn: 'немає' }).success).toBe(false);
    expect(schema.safeParse(base).success).toBe(false); // required on monograph_ua
  });

  it('leaves the ISBN optional on monograph_eu but still checks it when filled', () => {
    const schema = schemaFor('monograph_eu');
    const base = { pages: 200, coAuthors: 1, bibliography: 'Beschreibung' };

    expect(schema.safeParse(base).success).toBe(true);
    expect(schema.safeParse({ ...base, isbn: '' }).success).toBe(true);
    expect(schema.safeParse({ ...base, isbn: '978-3-16-148410-0' }).success).toBe(true);
    expect(schema.safeParse({ ...base, isbn: '978-3-16-148410-1' }).success).toBe(false);
  });

  it('accepts a DOI in any pasted form and stores it bare', () => {
    const schema = schemaFor('publication_cat_a');
    const base = {
      option: 'q1',
      bibliography: 'Опис',
      link: 'https://www.scopus.com/record/display.uri?eid=2-s2.0-123',
    };

    // The resolver prefix is stripped so the future checker can query it directly
    const parsed = schema.parse({ ...base, doi: 'https://doi.org/10.1038/abc123' });
    expect(parsed).toMatchObject({ doi: '10.1038/abc123' });

    expect(schema.safeParse({ ...base, doi: 'doi:10.1038/abc123' }).success).toBe(true);
    expect(schema.safeParse({ ...base, doi: '10.1038/abc123' }).success).toBe(true);
    expect(schema.safeParse({ ...base, doi: 'немає' }).success).toBe(false);
  });

  it('accepts a Scopus or WoS link but refuses any other site', () => {
    const schema = schemaFor('publication_cat_a');
    const base = { option: 'q1', bibliography: 'Опис' };
    const ok = (link: string) => schema.safeParse({ ...base, link }).success;

    // A Scopus link with no DOI to hand must still submit — the DOI is optional
    expect(ok('https://www.scopus.com/record/display.uri?eid=2-s2.0-1')).toBe(true);
    expect(ok('https://www.webofscience.com/wos/woscc/full-record/WOS:000123')).toBe(true);
    expect(ok('http://apps.webofknowledge.com/full_record.do?x=1')).toBe(true);
    expect(ok('www.scopus.com/record/display.uri?eid=1')).toBe(true); // pasted without protocol

    // The point: a valid URL is no longer enough
    expect(ok('https://example.com/paper.pdf')).toBe(false);
    expect(ok('https://drive.google.com/file/d/abc')).toBe(false);
    expect(ok('https://doi.org/10.1038/abc')).toBe(false); // the DOI has its own field
  });

  it('mustBeTrue checkbox requires confirmation', () => {
    const schema = schemaFor('basic_education_match');
    expect(schema.safeParse({ confirmed: false, specialty: 'Економіка' }).success).toBe(false);
    expect(schema.safeParse({ confirmed: true, specialty: 'Економіка' }).success).toBe(true);
  });

  it('builds a schema from an arbitrary field set, not from a code', () => {
    // What the admin builder relies on: fields the catalogue never defined
    const schema = schemaForFields([
      { kind: 'text', name: 'title', label: 'Назва' },
      { kind: 'number', name: 'count', label: 'Кількість', min: 1, int: true },
      { kind: 'text', name: 'note', label: 'Примітка', optional: true },
    ]);
    expect(schema.safeParse({ title: 'Журі', count: 2 }).success).toBe(true);
    expect(schema.safeParse({ title: '', count: 2 }).success).toBe(false);
    expect(schema.safeParse({ title: 'Журі', count: 0 }).success).toBe(false);
    expect(schema.safeParse({ title: 'Журі', count: 1.5 }).success).toBe(false);
    expect(schema.safeParse({ title: 'Журі', count: 2, extra: 1 }).success).toBe(false);
  });
});

describe('an empty required field says it is required, not malformed', () => {
  // A person who typed nothing is told what is WRONG with what they typed.
  // «Некоректне посилання» over an empty box sends them looking for a typo in
  // a field they never touched; the three kinds below all did this, because
  // each pipes an empty string straight into a format check.
  const messageFor = (field: EvidenceField, value: unknown) => {
    const result = fieldSchema(field).safeParse(value);
    return result.success ? null : result.error.issues[0].message;
  };

  it('url', () => {
    expect(messageFor(url('link', 'Посилання'), '')).toBe("Обов'язкове поле");
  });

  it('isbn', () => {
    expect(messageFor(isbn('isbn', 'ISBN'), '')).toBe("Обов'язкове поле");
  });

  it('doi', () => {
    expect(messageFor(doi('doi', 'DOI'), '')).toBe("Обов'язкове поле");
  });

  it('still names the real fault when something WAS typed', () => {
    expect(messageFor(url('link', 'Посилання'), 'not-a-url')).toBe('Некоректне посилання');
    expect(messageFor(isbn('isbn', 'ISBN'), '978-3-16-148410-1')).toMatch(/ISBN/);
    expect(messageFor(doi('doi', 'DOI'), 'nonsense')).toMatch(/DOI/);
  });

  it('leaves the optional form of each kind accepting an empty box', () => {
    expect(fieldSchema(url('link', 'Посилання', { optional: true })).safeParse('').success).toBe(
      true
    );
    expect(fieldSchema(isbn('isbn', 'ISBN', { optional: true })).safeParse('').success).toBe(true);
    expect(fieldSchema(doi('doi', 'DOI', { optional: true })).safeParse('').success).toBe(true);
  });
});

describe('a number field can have a ceiling, not only a floor', () => {
  // «Рік початку» carried `min: 1950` and nothing above it, so 123123 was a
  // valid year of employment — it saved, and printed into the licence document
  // as «Рік початку: 123123». A floor alone is not a range.
  const yearField = number('fromYear', 'Рік початку', { min: 1950, max: 2026, int: true });

  const problem = (value: unknown) => {
    const result = fieldSchema(yearField).safeParse(value);
    return result.success ? null : result.error.issues[0].message;
  };

  it('accepts a year inside the range', () => {
    expect(problem(1998)).toBeNull();
    expect(problem(2026)).toBeNull();
    expect(problem(1950)).toBeNull();
  });

  it('refuses a year above the ceiling, in Ukrainian', () => {
    expect(problem(123123)).toBe('Максимальне значення — 2026');
    expect(problem(2027)).toBe('Максимальне значення — 2026');
  });

  it('still refuses one below the floor', () => {
    expect(problem(123)).toBe('Мінімальне значення — 1950');
  });

  it('leaves a field with no ceiling unbounded', () => {
    // Most numbers in the catalogue are counts — сторінки, співавтори, дні —
    // and inventing a maximum for those would refuse real work.
    const pages = number('pages', 'Кількість сторінок', { min: 1, int: true });
    expect(fieldSchema(pages).safeParse(100000).success).toBe(true);
  });
});

describe('an optional select may be left unanswered', () => {
  // «Призове місце» on п.15 has four real answers, but the jury variants of
  // that position have no place to record — so the field has to be a list AND
  // skippable. Before this a select was always required.
  const field = select(
    'place',
    'Призове місце',
    [opt('first', 'I місце'), opt('laureate', 'лауреат')],
    { optional: true }
  );

  it('accepts a chosen option', () => {
    expect(fieldSchema(field).safeParse('first').success).toBe(true);
  });

  it('accepts an empty answer', () => {
    expect(fieldSchema(field).safeParse('').success).toBe(true);
    expect(fieldSchema(field).safeParse(undefined).success).toBe(true);
  });

  it('still refuses a value outside the list', () => {
    expect(fieldSchema(field).safeParse('second').success).toBe(false);
  });

  it('leaves a required select required', () => {
    const required = select('stage', 'Етап', [opt('a', 'A')]);
    expect(fieldSchema(required).safeParse('').success).toBe(false);
    expect(fieldSchema(required).safeParse('a').success).toBe(true);
  });
});

describe('dateRange — one field, two ends, never backwards', () => {
  // «Рік початку / Рік завершення» were two independent answers, so 2019 → 2014
  // saved happily. A range cannot express that: the picker writes the two ends
  // in order, and the schema refuses the inversion a request could still forge.
  const field = dateRange('period', 'Період роботи');
  const parse = (v: unknown) => fieldSchema(field).safeParse(v);

  const year = new Date().getFullYear();
  const recent = `${year - 3}-09-01`;
  const later = `${year - 1}-08-31`;

  it('accepts a range in order', () => {
    expect(parse({ from: recent, to: later }).success).toBe(true);
  });

  it('accepts a single day at both ends', () => {
    expect(parse({ from: recent, to: recent }).success).toBe(true);
  });

  it('refuses an end before its start', () => {
    const result = parse({ from: later, to: recent });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toMatch(/раніше/);
  });

  it('refuses a half-filled range', () => {
    expect(parse({ from: recent }).success).toBe(false);
    expect(parse({ to: later }).success).toBe(false);
  });

  it('refuses nonsense in place of a date', () => {
    expect(parse({ from: '123123', to: later }).success).toBe(false);
    expect(parse('2014-2019').success).toBe(false);
  });

  it('refuses a period before the university could have signed anything', () => {
    // A decade back, not 1950 (owner, 2026-09-14): п.11 records consulting «на
    // підставі договору із закладом вищої освіти».
    expect(parse({ from: '1994-09-01', to: '1999-08-31' }).success).toBe(false);
    expect(parse({ from: `${year - 11}-01-01`, to: later }).success).toBe(false);
    expect(parse({ from: `${year - 9}-01-01`, to: later }).success).toBe(true);
  });

  it('lets an optional range be left empty', () => {
    const opt_ = dateRange('period', 'Період', { optional: true });
    expect(fieldSchema(opt_).safeParse(undefined).success).toBe(true);
    expect(fieldSchema(opt_).safeParse('').success).toBe(true);
  });
});

describe('date with `currentYear` — old publications refused (owner, 2026-09-24)', () => {
  const field = date('publishedOn', 'Опубліковано/Проіндексовано', { rule: 'currentYear' });
  const parse = (v: unknown) => fieldSchema(field).safeParse(v);

  // 20 March 2026, midday in Kyiv.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-20T10:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('accepts 1 January and today', () => {
    expect(parse('2026-01-01').success).toBe(true);
    expect(parse('2026-03-20').success).toBe(true);
  });

  it('refuses last year, naming the year that is accepted', () => {
    const result = parse('2025-12-31');
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe('Приймаються лише публікації 2026 року');
  });

  it('refuses tomorrow', () => {
    expect(parse('2026-03-21').success).toBe(false);
  });

  it('does not re-judge a date already saved, only a changed one', () => {
    const edit = (v: string) =>
      schemaForFields([field], undefined, { stored: { publishedOn: '2025-11-03' } }).safeParse({
        publishedOn: v,
      });
    expect(edit('2025-11-03').success).toBe(true);
    expect(edit('2025-11-04').success).toBe(false);
  });

  it('leaves a date field without the rule as it was', () => {
    expect(fieldSchema(date('d', 'Дата')).safeParse('2019-05-01').success).toBe(true);
  });
});

describe('currentYearBounds', () => {
  it('reads the year in Kyiv — 00:30 on 1 January there is still December in UTC', () => {
    expect(currentYearBounds(new Date('2026-12-31T22:30:00Z'))).toEqual({
      min: '2027-01-01',
      max: '2027-01-01',
    });
  });
});
