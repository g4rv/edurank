import { describe, expect, it } from 'vitest';
import {
  formatOrcid,
  isValidOrcid,
  normaliseOrcid,
  orcidCheckDigit,
  orcidDigits,
  orcidState,
  orcidUrl,
} from './orcid';

describe('normaliseOrcid', () => {
  it('keeps a canonical identifier', () => {
    expect(normaliseOrcid('0000-0002-1825-0097')).toBe('0000-0002-1825-0097');
  });

  it('adds the hyphens back', () => {
    expect(normaliseOrcid('0000000218250097')).toBe('0000-0002-1825-0097');
  });

  // The checksum character may be X, and a digits-only test would reject one
  // ORCID in ten.
  it('accepts an X checksum, in either case', () => {
    expect(normaliseOrcid('0000-0002-1694-233x')).toBe('0000-0002-1694-233X');
    expect(normaliseOrcid('0000-0002-1694-233X')).toBe('0000-0002-1694-233X');
  });

  // What people actually paste — the whole address off the profile page.
  it.each([
    'https://orcid.org/0000-0002-1825-0097',
    'http://orcid.org/0000-0002-1825-0097',
    'https://www.orcid.org/0000-0002-1825-0097',
    'orcid.org/0000-0002-1825-0097',
    'https://orcid.org/0000-0002-1825-0097/',
    '  0000-0002-1825-0097  ',
  ])('strips %s down to the identifier', (input) => {
    expect(normaliseOrcid(input)).toBe('0000-0002-1825-0097');
  });

  it('returns null for anything that is not an ORCID', () => {
    expect(normaliseOrcid(null)).toBeNull();
    expect(normaliseOrcid(undefined)).toBeNull();
    expect(normaliseOrcid('')).toBeNull();
    expect(normaliseOrcid('   ')).toBeNull();
    expect(normaliseOrcid('не вказано')).toBeNull();
    expect(normaliseOrcid('0000-0002-1825')).toBeNull();
    expect(normaliseOrcid('0000-0002-1825-00977')).toBeNull();
    // X is the checksum character only — it is not a digit anywhere else.
    expect(normaliseOrcid('0000-0002-18X5-0097')).toBeNull();
    // A Scopus link is a link, but it is not this one.
    expect(
      normaliseOrcid('https://www.scopus.com/authid/detail.uri?authorId=7004212771')
    ).toBeNull();
  });
});

describe('orcidUrl', () => {
  it('builds the profile address from the identifier', () => {
    expect(orcidUrl('0000000218250097')).toBe('https://orcid.org/0000-0002-1825-0097');
  });

  // Never guess an address for something unrecognised: it would send an editor
  // to a 404 that looks like the person's own page.
  it('is null when the value is not an ORCID', () => {
    expect(orcidUrl('щось інше')).toBeNull();
    expect(orcidUrl(null)).toBeNull();
  });
});

describe('orcidCheckDigit', () => {
  // Josiah Carberry, the identifier ORCID's own documentation uses.
  it('computes the published example', () => {
    expect(orcidCheckDigit('000000021825009')).toBe('7');
  });

  // 10 is written X, which is why an ORCID may end in a letter.
  it('writes a remainder of 10 as X', () => {
    expect(orcidCheckDigit('000000021694233')).toBe('X');
  });
});

describe('isValidOrcid', () => {
  it('accepts a correct identifier in any of its written forms', () => {
    expect(isValidOrcid('0000-0002-1825-0097')).toBe(true);
    expect(isValidOrcid('0000000218250097')).toBe(true);
    expect(isValidOrcid('https://orcid.org/0000-0002-1825-0097')).toBe(true);
    expect(isValidOrcid('0000-0002-1694-233X')).toBe(true);
  });

  // The whole reason the field checks a checksum rather than a length: one
  // wrong digit is a person who does not exist, and only this catches it.
  it('rejects a single mistyped digit', () => {
    expect(isValidOrcid('0000-0002-1825-0098')).toBe(false);
    expect(isValidOrcid('0000-0002-1825-0197')).toBe(false);
  });

  it('rejects what is not an ORCID at all', () => {
    expect(isValidOrcid('не знаю')).toBe(false);
    expect(isValidOrcid('')).toBe(false);
    expect(isValidOrcid(null)).toBe(false);
  });
});

describe('orcidState', () => {
  it('says nothing about an empty field', () => {
    expect(orcidState('')).toBe('empty');
    expect(orcidState('   ')).toBe('empty');
  });

  // Never an error while it is still too short to judge: being told you are
  // wrong halfway through typing sixteen digits is noise.
  it('is partial while the value is still too short', () => {
    expect(orcidState('0000')).toBe('partial');
    expect(orcidState('0000-0002-1825-009')).toBe('partial');
  });

  it('is valid once the sixteenth character agrees', () => {
    expect(orcidState('0000-0002-1825-0097')).toBe('valid');
    expect(orcidState('https://orcid.org/0000-0002-1694-233X')).toBe('valid');
  });

  it('is invalid for a bad checksum, a stray letter, or too many digits', () => {
    expect(orcidState('0000-0002-1825-0098')).toBe('invalid');
    expect(orcidState('0000-0002-18a5-0097')).toBe('invalid');
    expect(orcidState('0000-0002-1825-00977')).toBe('invalid');
  });

  // X is the check character and belongs in the sixteenth place only.
  it('rejects an X anywhere but the end', () => {
    expect(orcidState('0000-X002-1825-0097')).toBe('invalid');
  });
});

describe('orcidDigits', () => {
  it('keeps only what an ORCID can contain', () => {
    expect(orcidDigits('0000-0002-1825-0097')).toBe('0000000218250097');
    expect(orcidDigits('0000 0002 1825 0097')).toBe('0000000218250097');
    expect(orcidDigits('abc0000def0002')).toBe('00000002');
  });

  it('reduces a pasted profile address to the identifier', () => {
    expect(orcidDigits('https://orcid.org/0000-0002-1825-0097')).toBe('0000000218250097');
  });

  it('stops at sixteen, so a stray extra keystroke does nothing', () => {
    expect(orcidDigits('00000002182500977777')).toBe('0000000218250097');
  });

  // X is the check character. Anywhere else it is a typo, and dropping it is
  // kinder than accepting it and going red.
  it('accepts X in the last place only', () => {
    expect(orcidDigits('000000021694233X')).toBe('000000021694233X');
    // The X is dropped, so fifteen characters are left — not padded back to 16.
    expect(orcidDigits('0000X00216942330')).toBe('000000216942330');
  });
});

describe('formatOrcid', () => {
  it('groups in fours as the value grows', () => {
    expect(formatOrcid('')).toBe('');
    expect(formatOrcid('0000')).toBe('0000');
    expect(formatOrcid('00000')).toBe('0000-0');
    expect(formatOrcid('0000000218250097')).toBe('0000-0002-1825-0097');
  });

  // The field hands its own output straight back in on the next keystroke, so
  // formatting an already-formatted value must not move anything.
  it('is stable when applied to its own result', () => {
    const once = formatOrcid('0000000218250097');
    expect(formatOrcid(once)).toBe(once);
    expect(formatOrcid(formatOrcid('00000'))).toBe('0000-0');
  });

  it('takes a pasted address down to the masked identifier', () => {
    expect(formatOrcid('https://orcid.org/0000-0002-1694-233X')).toBe('0000-0002-1694-233X');
  });
});

// A real ORCID ending in X, raised by the owner (2026-08-25). The check
// character is 10 about one time in eleven, so a digits-only field would reject
// one colleague in every eleven — which is why nothing here tests on `\d{16}`.
describe('an ORCID ending in X', () => {
  const id = '0000-0002-0481-850X';

  it('is valid, and stays valid however it was entered', () => {
    expect(isValidOrcid(id)).toBe(true);
    expect(isValidOrcid('0000000204818 50x')).toBe(true);
    expect(isValidOrcid(`https://orcid.org/${id}`)).toBe(true);
  });

  it('masks to the same thing from a lower-case or pasted form', () => {
    expect(formatOrcid(id)).toBe(id);
    expect(formatOrcid('0000000204818 50x')).toBe(id);
    expect(formatOrcid(`https://orcid.org/${id}`)).toBe(id);
  });

  it('shows the tick and builds a link', () => {
    expect(orcidState(id)).toBe('valid');
    expect(normaliseOrcid(id)).toBe(id);
    expect(orcidUrl(id)).toBe(`https://orcid.org/${id}`);
  });
});
