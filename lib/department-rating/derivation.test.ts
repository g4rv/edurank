import { describe, expect, it } from 'vitest';
import { derivationCodes, readDerivation } from './derivation';

const valid = {
  coverage: 'FULL',
  from: [
    {
      code: 'publication_cat_a',
      when: { field: 'option', in: ['q1'] },
      keys: ['doi'],
      text: 'bibliography',
    },
  ],
};

describe('readDerivation', () => {
  it('reads a valid mapping', () => {
    expect(readDerivation(valid)).toEqual(valid);
  });

  it('is null for a line typed by hand', () => {
    expect(readDerivation(null)).toBeNull();
    expect(readDerivation(undefined)).toBeNull();
  });

  it('is null for anything malformed, never a throw', () => {
    expect(readDerivation({ coverage: 'MAYBE', from: valid.from })).toBeNull();
    expect(readDerivation({ coverage: 'FULL', from: [] })).toBeNull();
    expect(readDerivation('FULL')).toBeNull();
    expect(readDerivation({ coverage: 'FULL', from: [{ code: 'x', keys: [] }] })).toBeNull();
  });
});

describe('derivationCodes', () => {
  it('lists each code once, skipping hand-typed lines', () => {
    const two = readDerivation({
      coverage: 'PARTIAL',
      from: [
        { code: 'publication_cat_a', keys: [], text: 'bibliography' },
        { code: 'patent_granted', keys: [], text: 'title' },
      ],
    });
    expect(derivationCodes([readDerivation(valid), null, two]).sort()).toEqual([
      'patent_granted',
      'publication_cat_a',
    ]);
  });
});
