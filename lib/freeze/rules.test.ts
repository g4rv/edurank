import { describe, expect, it } from 'vitest';
import {
  anyFrozen,
  effectiveFreeze,
  NO_FREEZE,
  NOTHING_FROZEN,
  type FreezeSettings,
} from './rules';

const on = (over: Partial<FreezeSettings>): FreezeSettings => ({ ...NOTHING_FROZEN, ...over });
const user = { role: 'USER', exempt: false };
const editor = { role: 'EDITOR', exempt: false };

describe('effectiveFreeze', () => {
  it('freezes nothing while every switch is off', () => {
    expect(effectiveFreeze(NOTHING_FROZEN, user)).toEqual(NO_FREEZE);
  });

  it('follows each switch on its own', () => {
    expect(effectiveFreeze(on({ kharakterystykaFrozen: true }), user)).toEqual({
      kharakterystyka: true,
      linkedRating: false,
      profile: false,
    });
    expect(effectiveFreeze(on({ linkedRatingFrozen: true }), user)).toEqual({
      kharakterystyka: false,
      linkedRating: true,
      profile: false,
    });
    expect(effectiveFreeze(on({ profileFrozen: true }), user)).toEqual({
      kharakterystyka: false,
      linkedRating: false,
      profile: true,
    });
  });

  // The master is an override: nobody's per-switch choice is lost under it.
  it('freezes everything under the master switch, whatever the three say', () => {
    expect(effectiveFreeze(on({ allFrozen: true }), user)).toEqual({
      kharakterystyka: true,
      linkedRating: true,
      profile: true,
    });
  });

  it('never freezes ADMIN', () => {
    expect(effectiveFreeze(on({ allFrozen: true }), { role: 'ADMIN', exempt: false })).toEqual(
      NO_FREEZE
    );
  });

  it('never freezes somebody on the whitelist', () => {
    expect(effectiveFreeze(on({ allFrozen: true }), { role: 'USER', exempt: true })).toEqual(
      NO_FREEZE
    );
    expect(
      effectiveFreeze(on({ kharakterystykaFrozen: true }), { role: 'EDITOR', exempt: true })
    ).toEqual(NO_FREEZE);
  });

  // The profile freeze is the plain НПП's; the Характеристика and its
  // indicators close for editors too (lib/kharakterystyka/freeze.ts).
  it('closes the profile for USER only, the document for every non-admin', () => {
    expect(effectiveFreeze(on({ allFrozen: true }), editor)).toEqual({
      kharakterystyka: true,
      linkedRating: true,
      profile: false,
    });
    expect(effectiveFreeze(on({ profileFrozen: true }), editor).profile).toBe(false);
  });

  it('returns the shared NO_FREEZE object, which cannot be mutated by accident', () => {
    expect(Object.isFrozen(NO_FREEZE)).toBe(true);
    expect(Object.isFrozen(NOTHING_FROZEN)).toBe(true);
  });
});

describe('anyFrozen', () => {
  it('is false with every switch off', () => {
    expect(anyFrozen(NOTHING_FROZEN)).toBe(false);
  });

  it('is true with any one switch on', () => {
    for (const key of Object.keys(NOTHING_FROZEN) as (keyof FreezeSettings)[]) {
      expect(anyFrozen(on({ [key]: true }))).toBe(true);
    }
  });
});
