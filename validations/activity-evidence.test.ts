import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACTIVITY_TYPES_2026 } from '@/lib/rating/activity-types';
import {
  checkbox,
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
import {
  currentYearBounds,
  fieldSchema,
  ratingYearBounds,
  schemaForFields,
} from './activity-evidence';

// Schemas are built from an activity type's own field specs. Here they are
// built from the catalogue through `catalogueType`, the same conversion the
// seed writes into the DB — so these tests still cover the real 2026 forms.
const schemaFor = (code: string) => catalogueType(code).schema;

/** Score a catalogue code, optionally overriding its coefficient */
function score(code: string, evidence: unknown, coefficient?: number) {
  const type = catalogueType(code);
  return computeScore(coefficient === undefined ? type : { ...type, coefficient }, evidence);
}

/** 5.1's six матеріали — the checkboxes of its «Матеріали курсу» group */
const MOODLE_MATERIALS = catalogueType('moodle_course')
  .evidenceFields.filter((f) => f.kind === 'checkbox' && f.group === 'Матеріали курсу')
  .map((f) => f.name);

/** Build a valid sample evidence object straight from the field specs */
function sampleEvidence(fields: readonly EvidenceField[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    switch (f.kind) {
      case 'text':
        out[f.name] = 'Тестове значення';
        break;
      case 'number':
        // A monograph's share must reach 1,5 sheets — 2 clears every floor here
        out[f.name] = f.name === 'sheets' ? 2 : Math.max(f.min ?? 0, 1);
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
      case 'issn':
        out[f.name] = '0028-0836';
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

  it('scoring fields are present per kind (value / sheets / credits / mode + materials)', () => {
    const names = (code: string) => EVIDENCE_FIELDS[code].map((f) => f.name);
    for (const def of ACTIVITY_TYPES_2026) {
      if (def.kind === 'MULT') {
        const n = names(def.code);
        expect(
          n.includes('value') || n.includes('sheets'),
          `${def.code}: MULT needs value or sheets`
        ).toBe(true);
      }
      if (def.code === 'intl_internship' || def.code === 'ukr_internship') {
        expect(names(def.code)).toContain('credits');
      }
      if (def.kind === 'CHECK_SUM') expect(names(def.code)).toContain('mode');
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

  // CHECK_SUM with nothing ticked sums to 0, and a saved 0 would read as
  // «Зараховано» beside no points at all — refused by the schema. 5.1 used this
  // rule until 2026-10-16; the kind stays, so it is tested on a fixture.
  it('a CHECK_SUM form refuses nothing ticked and lands on the first box', () => {
    const fields: EvidenceField[] = [
      select('mode', 'Вид', [{ value: 'a', label: 'A' }]),
      checkbox('one', 'Один', { points: { a: 10 }, group: 'G' }),
      checkbox('two', 'Два', { points: { a: 5 }, group: 'G' }),
    ];
    const schema = schemaForFields(fields, { kind: 'CHECK_SUM' });
    const none = schema.safeParse({ mode: 'a', one: false, two: false });
    expect(none.success).toBe(false);
    expect(none.error?.issues[0].message).toContain('хоча б один');
    expect(none.error?.issues[0].path).toEqual(['one']);
    expect(schema.safeParse({ mode: 'a', one: false, two: true }).success).toBe(true);
  });
});

describe('5.1 «Я лектор» (owner, 2026-10-16)', () => {
  const schema = schemaFor('moodle_course');
  const lecturer = {
    isLecturer: true,
    mode: 'development',
    discipline: 'Педагогіка',
    link: 'https://moodle.example/course/1',
    syllabus: true,
  };

  it('saves with the switch OFF and nothing else', () => {
    const r = schema.safeParse({ isLecturer: false });
    expect(r.success).toBe(true);
    expect(r.data).toEqual({ isLecturer: false });
  });

  it('drops whatever was typed behind the switch once it is OFF', () => {
    const r = schema.safeParse({ ...lecturer, isLecturer: false });
    expect(r.success).toBe(true);
    expect(r.data).toEqual({ isLecturer: false });
  });

  it('with the switch ON requires вид роботи, дисципліна and посилання', () => {
    for (const key of ['mode', 'discipline', 'link'] as const) {
      const r = schema.safeParse({ ...lecturer, [key]: '' });
      expect(r.success, key).toBe(false);
      expect(
        r.error?.issues.map((i) => i.path[0]),
        key
      ).toContain(key);
    }
  });

  it('with the switch ON requires at least one матеріал', () => {
    const none = { ...lecturer, syllabus: false };
    const r = schema.safeParse(none);
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toContain('хоча б один');
    expect(r.error?.issues[0].path).toEqual([MOODLE_MATERIALS[0]]);
    for (const material of MOODLE_MATERIALS) {
      expect(schema.safeParse({ ...none, [material]: true }).success, material).toBe(true);
    }
  });

  it('accepts a complete lecturer entry', () => {
    expect(schema.safeParse(lecturer).success).toBe(true);
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
      sheets: '5',
      coAuthors: '2',
      isbn: '978-3-16-148410-0',
      bibliography: 'Опис',
    });
    expect(parsed).toMatchObject({ sheets: 5, coAuthors: 2 });
    expect(score('monograph_ua', parsed, 200)).toEqual({ computedValue: 2.5, score: 500 });
  });

  it('rejects an ISBN whose check digit does not match', () => {
    const schema = schemaFor('monograph_ua');
    const base = { sheets: 5, coAuthors: 2, bibliography: 'Опис' };

    expect(schema.safeParse({ ...base, isbn: '978-3-16-148410-0' }).success).toBe(true);
    expect(schema.safeParse({ ...base, isbn: '9783161484100' }).success).toBe(true);
    expect(schema.safeParse({ ...base, isbn: '0-8044-2957-X' }).success).toBe(true);

    expect(schema.safeParse({ ...base, isbn: '978-3-16-148410-1' }).success).toBe(false);
    expect(schema.safeParse({ ...base, isbn: 'немає' }).success).toBe(false);
    expect(schema.safeParse(base).success).toBe(false); // required on monograph_ua
  });

  it('leaves the ISBN optional on monograph_eu but still checks it when filled', () => {
    const schema = schemaFor('monograph_eu');
    const base = { sheets: 8.3, coAuthors: 1, bibliography: 'Beschreibung' };

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

  describe('from 1950 to ten years ahead (owner, 2026-10-16)', () => {
    // 1 January 2027, 01:00 in Kyiv — still 2026 in UTC.
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-12-31T23:00:00Z'));
    });
    afterEach(() => vi.useRealTimers());

    it('accepts a period that began decades ago', () => {
      // Replaces «a decade back» (2026-09-14): п.20's «Період роботи» starts
      // in the nineties as often as not.
      expect(parse({ from: '1994-09-01', to: '1999-08-31' }).success).toBe(true);
      expect(parse({ from: '1950-01-01', to: '1951-06-30' }).success).toBe(true);
    });

    it('refuses a day before 1950', () => {
      expect(parse({ from: '1949-12-31', to: '1951-06-30' }).success).toBe(false);
    });

    it('accepts a future end, as a fixed-term contract has, up to the year ten years ahead in Kyiv', () => {
      expect(parse({ from: '2020-09-01', to: '2030-08-31' }).success).toBe(true);
      expect(parse({ from: '2020-09-01', to: '2037-12-31' }).success).toBe(true);
    });

    it('refuses an end past that', () => {
      const result = parse({ from: '2020-09-01', to: '2038-01-01' });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.issues[0].message).toMatch(/2037/);
    });
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

describe('date with `ratingYear` — 3.11, the rating year only (owner, 2026-10-27)', () => {
  const field = date('publishedOn', 'Дата публікації', { rule: 'ratingYear' });
  const parse = (v: string, ratingYear?: number) =>
    schemaForFields([field], undefined, { ratingYear }).safeParse({ publishedOn: v });
  const message = (v: string, ratingYear?: number) => parse(v, ratingYear).error?.issues[0].message;

  afterEach(() => vi.useRealTimers());

  it('takes any day of the rating year up to today', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-27T10:00:00Z'));
    expect(parse('2026-01-01', 2026).success).toBe(true);
    expect(parse('2026-10-27', 2026).success).toBe(true);
    expect(message('2026-10-28', 2026)).toBe('Дата не може бути в майбутньому');
    expect(message('2025-12-31', 2026)).toBe('Приймаються лише публікації 2026 року');
  });

  it("takes LAST year's publication while that rating year is still open in January", () => {
    // Why the rule is not `currentYear`: that would refuse every 2026 date here.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-01-15T10:00:00Z'));
    expect(parse('2026-12-20', 2026).success).toBe(true);
    // A January 2027 date belongs to 2027's rating — not «the future»
    expect(message('2027-01-05', 2026)).toBe('Приймаються лише публікації 2026 року');
  });

  it('falls back to the calendar year when no rating year is given', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-27T10:00:00Z'));
    expect(parse('2026-03-01').success).toBe(true);
    expect(parse('2025-03-01').success).toBe(false);
  });
});

describe('ratingYearBounds', () => {
  it('ends at today in the rating year, at 31 December once it is past', () => {
    expect(ratingYearBounds(2026, new Date('2026-10-27T10:00:00Z'))).toEqual({
      min: '2026-01-01',
      max: '2026-10-27',
    });
    expect(ratingYearBounds(2026, new Date('2027-01-15T10:00:00Z'))).toEqual({
      min: '2026-01-01',
      max: '2026-12-31',
    });
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

describe('a number field with a limit on its decimals', () => {
  const sheets: EvidenceField = {
    kind: 'number',
    name: 'value',
    label: 'Кількість друкованих аркушів',
    min: 1,
    decimals: 1,
  };
  const parse = (v: unknown, stored?: unknown) =>
    schemaForFields(
      [sheets],
      undefined,
      stored === undefined ? undefined : { stored: { value: stored } }
    ).safeParse({
      value: v,
    });

  it('accepts a whole number and one decimal, as typed or as a string', () => {
    for (const v of [2, 1.6, 1.7, '1.7', '12']) expect(parse(v).success).toBe(true);
  });

  it('refuses two decimals — 1,73 is not a valid number of sheets', () => {
    const r = parse(1.73);
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain('Не більше одного знака після коми');
    expect(parse('1.05').success).toBe(false);
  });

  it('still enforces the minimum', () => {
    expect(parse(0.5).success).toBe(false);
  });

  it('does not re-judge a value already saved', () => {
    expect(parse(1.73, 1.73).success).toBe(true);
    expect(parse(1.74, 1.73).success).toBe(false);
  });

  it('is a plain number field when no limit is set', () => {
    const plain: EvidenceField = { kind: 'number', name: 'value', label: 'x', min: 0 };
    expect(schemaForFields([plain]).safeParse({ value: 1.73 }).success).toBe(true);
  });
});

describe('the монографія personal share (minShare)', () => {
  const schema = schemaFor('monograph_ua');
  const base = { isbn: '978-3-16-148410-0', bibliography: 'Опис' };
  const issue = (r: { success: boolean; error?: { issues: unknown[] } }) =>
    JSON.stringify(r.error?.issues ?? []);

  it('accepts a sole author from 1,5 sheets and refuses less', () => {
    expect(schema.safeParse({ ...base, sheets: 1.5 }).success).toBe(true);
    const r = schema.safeParse({ ...base, sheets: 1.4 });
    expect(r.success).toBe(false);
    expect(issue(r)).toContain('не менше 1,5 друкованого аркуша');
    expect(issue(r)).toContain('"sheets"');
  });

  it('judges the share when there are co-authors, on the co-authors box', () => {
    // 4 / 2 = 2 — fine; 4 / 3 = 1,33 → 1,3 — refused
    expect(schema.safeParse({ ...base, sheets: 4, coAuthors: 2 }).success).toBe(true);
    const r = schema.safeParse({ ...base, sheets: 4, coAuthors: 3 });
    expect(r.success).toBe(false);
    expect(issue(r)).toContain('зараз — 1,3');
    expect(issue(r)).toContain('"coAuthors"');
  });

  it('measures the ROUNDED share — 1,46 counts as 1,5', () => {
    // 4,4 / 3 = 1,4666… → 1,5
    expect(schema.safeParse({ ...base, sheets: 4.4, coAuthors: 3 }).success).toBe(true);
  });

  it('refuses two decimals in the sheets box', () => {
    expect(schema.safeParse({ ...base, sheets: 2.25 }).success).toBe(false);
  });

  it('does not re-judge an entry whose two numbers are as saved', () => {
    const stored = { ...base, sheets: 1.1, coAuthors: 1 };
    const s = schemaForFields(
      catalogueType('monograph_ua').evidenceFields,
      catalogueType('monograph_ua').scoring,
      { stored }
    );
    expect(s.safeParse(stored).success).toBe(true);
    expect(s.safeParse({ ...stored, sheets: 1.2 }).success).toBe(false);
  });

  it('has no floor on 2.2 — a small методичка still saves', () => {
    const edition = schemaFor('edition_publication');
    expect(
      edition.safeParse({ option: 'recommendations', sheets: 0.8, bibliography: 'Опис' }).success
    ).toBe(true);
  });
});

describe('3.10 «Міжнародна публікація…» (owner, 2026-10-16)', () => {
  const schema = schemaFor('intl_peer_reviewed_publication');
  const base = {
    bibliography: 'Shevchenko O. Title. Journal. 2026. Vol. 1. P. 1–10.',
    reviewsLink: 'https://publisher.example/peer-review',
  };
  const paths = (r: { error?: { issues: { path: PropertyKey[] }[] } }) =>
    (r.error?.issues ?? []).map((i) => i.path[0]);

  it('takes a DOI alone — no ISSN, no article link needed', () => {
    expect(schema.safeParse({ ...base, doi: '10.1038/s41586-021-03819-2' }).success).toBe(true);
  });

  // The box is not even drawn with a DOI (owner, 2026-10-19) — a link typed
  // before the DOI went in must not be stored behind the person's back
  it('drops an article link given alongside a DOI', () => {
    const r = schema.safeParse({
      ...base,
      doi: '10.1038/s41586-021-03819-2',
      link: 'https://journal.example/a/1',
    });
    expect(r.success).toBe(true);
    expect(r.data).not.toHaveProperty('link');
  });

  it('takes an ISSN, but then asks for the article’s own page', () => {
    const noLink = schema.safeParse({ ...base, issn: '0028-0836' });
    expect(noLink.success).toBe(false);
    expect(paths(noLink)).toEqual(['link']);
    expect(
      schema.safeParse({ ...base, issn: '0028-0836', link: 'https://journal.example/a/1' }).success
    ).toBe(true);
  });

  it('refuses neither DOI nor ISSN, on both boxes', () => {
    const r = schema.safeParse({ ...base, link: 'https://journal.example/a/1' });
    expect(r.success).toBe(false);
    expect(paths(r).sort()).toEqual(['doi', 'issn']);
  });

  it('always wants the publisher’s page about the reviewing', () => {
    const r = schema.safeParse({
      bibliography: base.bibliography,
      doi: '10.1038/s41586-021-03819-2',
    });
    expect(r.success).toBe(false);
    expect(paths(r)).toEqual(['reviewsLink']);
  });

  it('refuses an ISSN whose check digit is wrong, and stores a good one hyphenated', () => {
    expect(
      schema.safeParse({ ...base, issn: '0028-0837', link: 'https://journal.example/a/1' }).success
    ).toBe(false);
    const ok = schema.safeParse({ ...base, issn: '00280836', link: 'https://journal.example/a/1' });
    expect(ok.data?.issn).toBe('0028-0836');
  });

  it('calls an unfinished ISSN short, not a wrong check digit', () => {
    const r = schema.safeParse({ ...base, issn: '0028-08', link: 'https://journal.example/a/1' });
    expect(r.error?.issues.map((i) => i.message)).toEqual([
      'ISSN має 8 символів, наприклад 0028-0836',
    ]);
  });

  it('scores 100', () => {
    const parsed = schema.parse({ ...base, doi: '10.1038/s41586-021-03819-2' });
    expect(score('intl_peer_reviewed_publication', parsed).score).toBe(100);
  });
});

describe('a decimal typed with a comma', () => {
  it('is read as a number — the box keeps the comma the person typed', () => {
    const r = schemaFor('monograph_ua').safeParse({
      sheets: '4,2',
      coAuthors: '2',
      isbn: '978-3-16-148410-0',
      bibliography: 'Опис',
    });
    expect(r.success).toBe(true);
    expect(r.data?.sheets).toBe(4.2);
  });
});
