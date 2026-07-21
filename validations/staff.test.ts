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
