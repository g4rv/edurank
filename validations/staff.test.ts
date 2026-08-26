import { describe, expect, it } from 'vitest';
import { staffUpdateSchema } from './staff';

// A profile link that is not on the service it claims renders as a dead link on
// the profile page and nobody notices, so the schema is where it gets caught.

const base = {
  lastName: 'Коваленко',
  firstName: 'Іван',
  patronymic: 'Петрович',
  email: 'kovalenko@university.edu.ua',
  isNpp: 'false',
  partTimeDepartmentIds: [],
};

const parse = (fields: Record<string, unknown>) =>
  staffUpdateSchema.safeParse({ ...base, ...fields });

describe('staff profile links', () => {
  it('accepts an empty value — these are optional', () => {
    expect(parse({ wosUrl: '', scopusUrl: null, googleScholarUrl: undefined }).success).toBe(true);
  });

  it('accepts a real link on each service', () => {
    expect(parse({ wosUrl: 'https://www.webofscience.com/wos/author/record/1' }).success).toBe(
      true
    );
    expect(
      parse({ scopusUrl: 'https://www.scopus.com/authid/detail.uri?authorId=7' }).success
    ).toBe(true);
    expect(parse({ googleScholarUrl: 'https://scholar.google.com/citations?user=x' }).success).toBe(
      true
    );
  });

  it('accepts a link pasted without the protocol', () => {
    expect(parse({ scopusUrl: 'www.scopus.com/authid/detail.uri?authorId=7' }).success).toBe(true);
  });

  it('refuses a link to the wrong service', () => {
    expect(parse({ scopusUrl: 'https://www.webofscience.com/x' }).success).toBe(false);
    expect(parse({ wosUrl: 'https://www.scopus.com/x' }).success).toBe(false);
    expect(parse({ googleScholarUrl: 'https://google.com/search?q=x' }).success).toBe(false);
  });

  it('refuses a random link', () => {
    expect(parse({ wosUrl: 'https://example.com/me' }).success).toBe(false);
    expect(parse({ scopusUrl: 'https://drive.google.com/file/d/abc' }).success).toBe(false);
  });

  // withProtocol turns any word into a parseable URL, so a domain check is what
  // keeps this rejected
  it('refuses text that is not a link at all', () => {
    expect(parse({ wosUrl: 'немає' }).success).toBe(false);
    expect(parse({ scopusUrl: 'not-a-url' }).success).toBe(false);
    expect(parse({ googleScholarUrl: '—' }).success).toBe(false);
  });

  it('names the service in the message so the fix is obvious', () => {
    const result = parse({ scopusUrl: 'https://example.com/me' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('Scopus');
    }
  });
});

// The self-edit form has always capped these; the admin/editor form took any
// length at all. Same columns, same person typing into them — the two shapes
// disagreeing is how one form ends up storing what the other rejects.
describe('free-text length limits', () => {
  it('accepts ordinary values', () => {
    // The phone is the CANONICAL form now, «+380» and nine digits with nothing
    // between them (2026-08-24). It used to be free text capped at 50, and this
    // line read «+380 44 123 45 67» — spaces and all — which is what the field
    // displays, not what it stores. `TelInput` formats for the eye and hands
    // the form one shape, so there is exactly one thing in the column.
    expect(parse({ phone: '+380441234567', orcidId: '0000-0002-1825-0097' }).success).toBe(true);
  });

  it('refuses an overlong phone, ORCID or specialty', () => {
    expect(parse({ phone: '0'.repeat(51) }).success).toBe(false);
    expect(parse({ orcidId: 'x'.repeat(51) }).success).toBe(false);
    expect(parse({ basicEducationSpecialty: 'я'.repeat(201) }).success).toBe(false);
  });

  it('still treats an empty value as null, not as a too-short string', () => {
    const result = parse({ phone: '', orcidId: '  ' });
    expect(result.success).toBe(true);
    expect(result.success && result.data.phone).toBeNull();
  });
});

describe('an НПП needs a кафедра — primary or additional', () => {
  const npp = (fields: Record<string, unknown>) => parse({ isNpp: 'true', ...fields });

  it('accepts a primary кафедра on its own', () => {
    expect(npp({ departmentId: 'd1' }).success).toBe(true);
  });

  // Owner, 2026-08-26: an НПП may hold ONLY an additional post — «основна» was
  // a box somebody had to tick, not a fact about the person. Everything
  // downstream then reads them as a сумісник on that кафедра, which is exactly
  // right: the 0,10–0,25 bounds, the badge, sorted last, and no place in that
  // кафедра's Кнпп. All of it falls out of `departmentId` being null, with no
  // extra column anywhere.
  it('accepts an additional кафедра on its own, with no primary', () => {
    expect(npp({ departmentId: '', partTimeDepartmentIds: ['d2'] }).success).toBe(true);
  });

  // The rule that replaces «must have a primary». Without it an НПП could be
  // saved attached to nothing — absent from every кафедра list, every ставка
  // grid and every Кнпп, and visible nowhere that would show the mistake.
  it('refuses an НПП with no кафедра at all', () => {
    const result = npp({ departmentId: '' });
    expect(result.success).toBe(false);
    expect(result.error!.issues.some((i) => i.path[0] === 'departmentId')).toBe(true);
  });

  it('lets a non-НПП have none — a division employee needs no кафедра', () => {
    expect(parse({ isNpp: 'false', departmentId: '' }).success).toBe(true);
  });
});

describe('partTimeDepartmentIds — at most one additional кафедра', () => {
  /** An НПП with a primary кафедра — the case this «at most one» rule bounds. */
  const npp = (partTimeDepartmentIds: string[]) =>
    parse({ isNpp: 'true', departmentId: 'd1', partTimeDepartmentIds });

  it('accepts none', () => {
    expect(npp([]).success).toBe(true);
  });

  it('accepts exactly one', () => {
    expect(npp(['d2']).success).toBe(true);
  });

  it('refuses two beside a primary — three кафедри in total', () => {
    const result = npp(['d2', 'd3']);
    expect(result.success).toBe(false);
    expect(result.error!.issues[0].message).toBe('НПП може працювати щонайбільше на двох кафедрах');
  });

  // Owner, 2026-08-26: сумісництво is a part-time POST, not «a second
  // кафедра». Somebody whose main job is not at the university can hold a
  // part-time post on two кафедри and a full-time one on neither.
  it('accepts two additional кафедри when there is no primary', () => {
    expect(
      parse({ isNpp: 'true', departmentId: '', partTimeDepartmentIds: ['d2', 'd3'] }).success
    ).toBe(true);
  });

  it('refuses three additional кафедри, primary or not', () => {
    const result = parse({
      isNpp: 'true',
      departmentId: '',
      partTimeDepartmentIds: ['d2', 'd3', 'd4'],
    });
    expect(result.success).toBe(false);
  });

  // Saved, it would put one person in one кафедра's grid twice.
  it('refuses the same кафедра twice among the additional ones', () => {
    const result = parse({
      isNpp: 'true',
      departmentId: '',
      partTimeDepartmentIds: ['d2', 'd2'],
    });
    expect(result.success).toBe(false);
  });

  it('refuses the primary кафедра as the additional one', () => {
    const result = npp(['d1']);
    expect(result.success).toBe(false);
    expect(result.error!.issues.some((i) => i.path[0] === 'partTimeDepartmentIds')).toBe(true);
  });
});

describe('phone', () => {
  const withPhone = (phone: unknown) => parse({ phone });

  it('accepts nothing — a phone number is optional', () => {
    expect(withPhone('').success).toBe(true);
    expect(withPhone(null).success).toBe(true);
  });

  it('accepts a complete number in the stored form', () => {
    expect(withPhone('+380441234567').success).toBe(true);
  });

  // The field hands out null until all nine digits are there, so this can only
  // arrive from outside the UI — which is exactly why the schema checks it.
  it('refuses a half-typed number', () => {
    expect(withPhone('+38044').success).toBe(false);
  });

  it('refuses a number without the country code', () => {
    expect(withPhone('0441234567').success).toBe(false);
    expect(withPhone('441234567').success).toBe(false);
  });

  it('refuses anything that is not a number at all', () => {
    expect(withPhone('телефон кафедри').success).toBe(false);
  });
});
