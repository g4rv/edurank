import { describe, expect, it } from 'vitest';
import {
  formatNational,
  formatPhoneDisplay,
  toPhoneValue,
  fromStoredPhone,
  isCompleteOrEmpty,
  nationalDigits,
} from './phone';

describe('nationalDigits', () => {
  it('keeps nine digits typed on their own', () => {
    expect(nationalDigits('441234567')).toBe('441234567');
  });

  // The three ways a Ukrainian number is written down, all meaning the same one
  it('strips the country code however it was pasted', () => {
    expect(nationalDigits('+380441234567')).toBe('441234567');
    expect(nationalDigits('380441234567')).toBe('441234567');
    expect(nationalDigits('+38 (044) 123-45-67')).toBe('441234567');
  });

  it('strips the national trunk zero', () => {
    expect(nationalDigits('0441234567')).toBe('441234567');
    expect(nationalDigits('(044) 123 45 67')).toBe('441234567');
  });

  it('throws away letters, spaces and punctuation', () => {
    expect(nationalDigits('тел. 044-123-45-67')).toBe('441234567');
  });

  it('never returns more than nine', () => {
    expect(nationalDigits('4412345671234')).toHaveLength(9);
  });

  it('is empty for an empty field', () => {
    expect(nationalDigits('')).toBe('');
    expect(nationalDigits('+380')).toBe('');
  });

  // «44» starts with no trunk zero and is shorter than nine — stripping here
  // would eat a digit the person is still typing
  it('leaves a half-typed number alone', () => {
    expect(nationalDigits('44')).toBe('44');
  });

  // ── the trunk zero is never part of the number ──
  //
  // This used to be `nationalDigits('0') === '0'`, on the reasoning that a lone
  // digit belongs to whoever is still typing. It does not: the field already
  // prints «+380» to the left, so a leading zero can only ever be the trunk
  // prefix, and keeping it cost a real bug (2026-08-31).
  it('drops a leading zero even before the number is complete', () => {
    expect(nationalDigits('0')).toBe('');
    expect(nationalDigits('093')).toBe('93');
  });

  // The regression. «044123456» is nine characters, so with the old rule it was
  // kept whole: the field showed «04-412-3456» with the green tick that means
  // finished, the schema counted nine digits and accepted it, and «+380044123456»
  // — undialable, no operator code starts with a zero — went into the database
  // with no error anywhere. Eight digits is the truthful answer, and the field
  // then says «8 з 9 цифр» instead of claiming to be done.
  it('does not read nine characters starting with a zero as a whole number', () => {
    expect(nationalDigits('044123456')).toBe('44123456');
    expect(isCompleteOrEmpty(nationalDigits('044123456'))).toBe(false);
  });

  it('still keeps all nine when the zero makes it ten', () => {
    expect(nationalDigits('0441234567')).toBe('441234567');
    expect(isCompleteOrEmpty(nationalDigits('0441234567'))).toBe(true);
  });
});

describe('formatNational', () => {
  it('groups 2-3-4, matching the «+380-__-___-____» mask', () => {
    expect(formatNational('441234567')).toBe('44-123-4567');
  });

  it('formats as far as the person has typed, with no trailing separator', () => {
    expect(formatNational('44')).toBe('44');
    expect(formatNational('441')).toBe('44-1');
    expect(formatNational('44123')).toBe('44-123');
    expect(formatNational('4412345')).toBe('44-123-45');
    expect(formatNational('')).toBe('');
  });
});

describe('fromStoredPhone', () => {
  it('round-trips what the field reported', () => {
    expect(fromStoredPhone(toPhoneValue('441234567'))).toBe('441234567');
  });

  it('is empty for a person with no number', () => {
    expect(fromStoredPhone(null)).toBe('');
    expect(fromStoredPhone(undefined)).toBe('');
  });
});

describe('isCompleteOrEmpty', () => {
  it('accepts nothing and accepts a whole number', () => {
    expect(isCompleteOrEmpty('')).toBe(true);
    expect(isCompleteOrEmpty('441234567')).toBe(true);
  });

  it('refuses a fragment — the one case the field exists to stop', () => {
    expect(isCompleteOrEmpty('4412')).toBe(false);
  });
});

// The field is CONTROLLED: what it shows is parsed back out of what it last
// reported. If a half-typed number cannot survive that round trip, every
// keystroke is discarded and nothing can be typed at all — which is exactly
// what shipped on 2026-08-24 and was caught on the screen, not by a test.
describe('the round trip a controlled field depends on', () => {
  it('survives a half-typed number', () => {
    for (const typed of ['4', '44', '441', '44123', '4412345', '44123456']) {
      expect(fromStoredPhone(toPhoneValue(typed))).toBe(typed);
    }
  });

  it('survives a complete number', () => {
    expect(fromStoredPhone(toPhoneValue('441234567'))).toBe('441234567');
  });

  it('survives an emptied field', () => {
    expect(toPhoneValue('')).toBe('');
    expect(fromStoredPhone('')).toBe('');
  });
});

describe('toPhoneValue', () => {
  it('carries a partial so the schema can refuse it on submit', () => {
    // Reporting null for a fragment would silently clear the column instead of
    // telling the person their number is incomplete.
    expect(toPhoneValue('4412')).toBe('+3804412');
  });

  it('is empty when nothing is typed', () => {
    expect(toPhoneValue('')).toBe('');
  });
});

describe('formatPhoneDisplay', () => {
  it('reads as a phone number, not as a run of digits', () => {
    expect(formatPhoneDisplay('+380124123124')).toBe('+380 12-412-3124');
  });

  it('is null for somebody with no number', () => {
    expect(formatPhoneDisplay(null)).toBeNull();
    expect(formatPhoneDisplay('')).toBeNull();
  });

  // There is none today, but an import could bring one. Reformatting a string
  // that is not our shape would assert it is a number when it may not be.
  it('shows anything unexpected exactly as stored', () => {
    expect(formatPhoneDisplay('внутрішній 42')).toBe('внутрішній 42');
    expect(formatPhoneDisplay('+38044')).toBe('+38044');
  });
});
