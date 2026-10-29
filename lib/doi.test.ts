import { describe, expect, it } from 'vitest';
import { doiHint, doisIn, doiState, doiUrl, isValidDoi, normalizeDoi } from './doi';

const DOI = '10.1038/s41586-021-03819-2'; // a real Nature DOI

describe('normalizeDoi', () => {
  it('leaves a bare DOI alone', () => {
    expect(normalizeDoi(DOI)).toBe(DOI);
  });

  it('strips the resolver URL in its various forms', () => {
    expect(normalizeDoi(`https://doi.org/${DOI}`)).toBe(DOI);
    expect(normalizeDoi(`http://dx.doi.org/${DOI}`)).toBe(DOI);
    expect(normalizeDoi(`https://www.doi.org/${DOI}`)).toBe(DOI);
  });

  it('strips a doi: prefix in either case', () => {
    expect(normalizeDoi(`doi:${DOI}`)).toBe(DOI);
    expect(normalizeDoi(`DOI:${DOI}`)).toBe(DOI);
  });

  it('trims whitespace and trailing punctuation from a copy-paste', () => {
    expect(normalizeDoi(`  ${DOI}.  `)).toBe(DOI);
    expect(normalizeDoi(`${DOI};`)).toBe(DOI);
  });

  // DOIs compare case-insensitively, but the printed form should survive
  it('preserves the case the publisher uses', () => {
    expect(normalizeDoi('10.1234/ABC-Def')).toBe('10.1234/ABC-Def');
  });
});

describe('isValidDoi', () => {
  it('accepts a bare DOI and every pasted URL form', () => {
    expect(isValidDoi(DOI)).toBe(true);
    expect(isValidDoi(`https://doi.org/${DOI}`)).toBe(true);
    expect(isValidDoi(`doi:${DOI}`)).toBe(true);
  });

  it('accepts the punctuation publishers put in suffixes', () => {
    expect(isValidDoi('10.1000/xyz123')).toBe(true);
    expect(isValidDoi('10.1103/PhysRevLett.116.061102')).toBe(true);
    expect(isValidDoi('10.1002/(SICI)1097-0142(19960101)77:1<1::AID>3.0.CO;2-A')).toBe(true);
  });

  it('rejects anything not shaped like a DOI', () => {
    expect(isValidDoi('')).toBe(false);
    expect(isValidDoi('немає')).toBe(false);
    expect(isValidDoi('https://www.scopus.com/record/display.uri?eid=2-s2.0-123')).toBe(false);
    expect(isValidDoi('https://example.com/paper.pdf')).toBe(false);
  });

  it('rejects a broken prefix', () => {
    expect(isValidDoi('11.1038/abc')).toBe(false); // must be 10.
    expect(isValidDoi('10./abc')).toBe(false); // no registrant digits
    expect(isValidDoi('10.12/abc')).toBe(false); // too few digits
    expect(isValidDoi('10.1234567890/abc')).toBe(false); // too many
  });

  it('rejects a missing or empty suffix', () => {
    expect(isValidDoi('10.1038')).toBe(false);
    expect(isValidDoi('10.1038/')).toBe(false);
  });

  it('rejects a suffix containing whitespace', () => {
    expect(isValidDoi('10.1038/abc def')).toBe(false);
  });

  // The limitation worth remembering: no check digit exists, so a one-character
  // typo produces another perfectly valid-looking DOI
  it('cannot detect a mistyped character — by design, DOIs have no checksum', () => {
    expect(isValidDoi('10.1038/s41586-021-03819-2')).toBe(true);
    expect(isValidDoi('10.1038/s41586-021-03819-3')).toBe(true);
  });
});

describe('doiUrl', () => {
  it('builds a resolver link from any accepted form', () => {
    expect(doiUrl(DOI)).toBe(`https://doi.org/${DOI}`);
    expect(doiUrl(`doi:${DOI}`)).toBe(`https://doi.org/${DOI}`);
    expect(doiUrl(`https://doi.org/${DOI}`)).toBe(`https://doi.org/${DOI}`);
  });
});

describe('doiState', () => {
  it('is empty for no input', () => {
    expect(doiState('')).toBe('empty');
    expect(doiState('   ')).toBe('empty');
  });

  // Must not go red while the prefix is still being typed
  it('is partial through the prefix', () => {
    for (const partial of ['1', '10', '10.', '10.1038', '10.1038/']) {
      expect(doiState(partial), partial).toBe('partial');
    }
  });

  it('is valid as soon as the suffix starts', () => {
    expect(doiState('10.1038/s')).toBe('valid');
    expect(doiState(`https://doi.org/${DOI}`)).toBe('valid');
  });

  it('is invalid for something that will never become a DOI', () => {
    expect(doiState('https://scopus.com/record')).toBe('invalid');
    expect(doiState('немає')).toBe('invalid');
    expect(doiState('11.1038/abc')).toBe('invalid');
  });
});

describe('doisIn — DOIs written inside other text', () => {
  it('finds a DOI at the end of a description, without its full stop', () => {
    expect(
      doisIn('Козубенко Л.М. … С. 354 – 358. https://doi.org/10.32782/2710-4656/2025.5.1/57.')
    ).toEqual(['10.32782/2710-4656/2025.5.1/57']);
  });

  it('lists each DOI once, in order', () => {
    expect(doisIn('doi:10.1000/A then 10.1000/b and again 10.1000/a')).toEqual([
      '10.1000/A',
      '10.1000/b',
    ]);
  });

  it('finds nothing in text with no DOI', () => {
    expect(doisIn('Педагогіка вищої школи. 2025. № 3 (42). С. 112–124.')).toEqual([]);
  });
});

describe('doiHint — what the DOI box says about the rest of the form', () => {
  const bib = 'Стаття. https://doi.org/10.32782/2710-4656/2025.5.1/57';

  it('warns when the box holds a DIFFERENT DOI than the description', () => {
    // Production, 2026-10-26: the second article carried the first one's DOI
    expect(doiHint('10.32782/2409-1154.2025.75.27', [bib])).toEqual({
      kind: 'mismatch',
      doi: '10.32782/2710-4656/2025.5.1/57',
    });
  });

  it('says nothing when the box matches, whatever the case or prefix', () => {
    expect(doiHint('https://doi.org/10.32782/2710-4656/2025.5.1/57', [bib])).toBeNull();
    expect(doiHint('10.32782/2710-4656/2025.5.1/57'.toUpperCase(), [bib])).toBeNull();
  });

  it('says nothing when the box DOI is among several the text names', () => {
    expect(doiHint('10.1000/b', ['10.1000/a and 10.1000/b'])).toBeNull();
  });

  it('suggests the DOI found when the box is empty', () => {
    expect(doiHint('', [bib])).toEqual({ kind: 'suggest', doi: '10.32782/2710-4656/2025.5.1/57' });
  });

  it('says nothing while the box holds something that is not yet a DOI', () => {
    expect(doiHint('10.32', [bib])).toBeNull();
  });

  it('says nothing when the rest of the form names no DOI', () => {
    expect(doiHint('10.1000/a', ['Без DOI'])).toBeNull();
    expect(doiHint('', [])).toBeNull();
  });
});
