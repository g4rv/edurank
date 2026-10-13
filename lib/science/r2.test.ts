import { describe, expect, it } from 'vitest';
import { isQualificationKeyOf, objectKeyFor, qualificationKeyFor } from './r2';

describe('qualificationKeyFor / isQualificationKeyOf', () => {
  it('builds qualifications/<staffId>/<random>.<ext>', () => {
    const key = qualificationKeyFor({ staffId: 'cabc123', ext: 'pdf' });
    expect(key).toMatch(/^qualifications\/cabc123\/[0-9a-f-]+\.pdf$/);
  });

  it('never repeats a key', () => {
    const a = qualificationKeyFor({ staffId: 's1', ext: 'jpg' });
    const b = qualificationKeyFor({ staffId: 's1', ext: 'jpg' });
    expect(a).not.toBe(b);
  });

  it('recognises a key in its owner’s folder, and nobody else’s', () => {
    const key = qualificationKeyFor({ staffId: 's1', ext: 'png' });
    expect(isQualificationKeyOf('s1', key)).toBe(true);
    expect(isQualificationKeyOf('s2', key)).toBe(false);
  });

  it('refuses a science key, a prefix trick and a path-shaped id', () => {
    expect(isQualificationKeyOf('s1', 'evidence/t1/abc.pdf')).toBe(false);
    // `s1` is a prefix of `s10`, but the folder boundary is the slash.
    expect(isQualificationKeyOf('s1', 'qualifications/s10/abc.pdf')).toBe(false);
    expect(isQualificationKeyOf('../x', 'qualifications/../x/abc.pdf')).toBe(false);
    expect(isQualificationKeyOf('', 'qualifications//abc.pdf')).toBe(false);
  });
});

describe('objectKeyFor', () => {
  it('builds evidence/<templateId>/<random>.<ext>', () => {
    const key = objectKeyFor({ templateId: 'tpl-1', ext: 'pdf' });
    expect(key).toMatch(/^evidence\/tpl-1\/[0-9a-f-]+\.pdf$/);
  });

  it('never repeats a key across two calls', () => {
    const a = objectKeyFor({ templateId: 'tpl-1', ext: 'pdf' });
    const b = objectKeyFor({ templateId: 'tpl-1', ext: 'pdf' });
    expect(a).not.toBe(b);
  });

  it('needs NO work — which is what lets the upload happen before the save', () => {
    // The key used to carry a `workId`, and that is precisely why a file could
    // only be uploaded AFTER the record existed: there was no id to build a
    // key from before it. That order made a record proved by a file alone
    // impossible (D27) and made a failed upload unrecoverable. The type no
    // longer accepts a work at all, so the old order cannot come back by
    // accident.
    const key = objectKeyFor({ templateId: 'tpl-1', ext: 'png' });
    expect(key.split('/')).toHaveLength(3);
  });

  it('needs no R2 credentials — pure string building', () => {
    // No env vars set in this test run; a throw here would mean the function
    // reached into process.env for something other than input, which the
    // brief explicitly forbids.
    expect(() => objectKeyFor({ templateId: 't', ext: 'png' })).not.toThrow();
  });
});
