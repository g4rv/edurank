import { describe, expect, it } from 'vitest';
import { RATED, takesPartInRating } from './external-part-timer';

describe('takesPartInRating', () => {
  it('is an НПП who is not an external part-timer', () => {
    expect(takesPartInRating({ isNpp: true, isExternalPartTimer: false })).toBe(true);
    expect(takesPartInRating({ isNpp: true })).toBe(true);
    expect(takesPartInRating({ isNpp: true, isExternalPartTimer: true })).toBe(false);
    expect(takesPartInRating({ isNpp: false, isExternalPartTimer: false })).toBe(false);
  });

  it('RATED is the same rule as a query filter', () => {
    expect(RATED).toEqual({ isNpp: true, isExternalPartTimer: false });
  });
});
