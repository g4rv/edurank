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
    expect(parse({ phone: '+380 44 123 45 67', orcidId: '0000-0002-1825-0097' }).success).toBe(
      true
    );
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
