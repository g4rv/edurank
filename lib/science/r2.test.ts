import { describe, expect, it } from 'vitest';
import { objectKeyFor } from './r2';

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
