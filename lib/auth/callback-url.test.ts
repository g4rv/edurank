import { describe, expect, it } from 'vitest';
import { safeCallbackPath } from './callback-url';

// The value arrives in a query string, so anybody can put anything in it. A
// login form that forwards to another site after a successful sign-in is a
// ready-made phishing step, so every case below is about refusing that.
describe('safeCallbackPath', () => {
  it('keeps a same-site path', () => {
    expect(safeCallbackPath('/stakes/abc123')).toBe('/stakes/abc123');
  });

  it('keeps the query string with it', () => {
    expect(safeCallbackPath('/staff?faculty=f1&dept=d2')).toBe('/staff?faculty=f1&dept=d2');
  });

  it.each([
    ['//evil.example', 'protocol-relative — a different origin to a browser'],
    ['/\\evil.example', 'backslash, normalised the same way by some browsers'],
    ['https://evil.example', 'absolute URL'],
    ['http://localhost:3000/staff', 'absolute, even to our own host'],
    ['javascript:alert(1)', 'script URL'],
    ['staff', 'relative with no leading slash'],
    ['', 'empty'],
  ])('refuses %s (%s)', (value) => {
    expect(safeCallbackPath(value)).toBeNull();
  });

  it('refuses null and undefined', () => {
    expect(safeCallbackPath(null)).toBeNull();
    expect(safeCallbackPath(undefined)).toBeNull();
  });

  // Bouncing somebody back to the form they just completed reads as a failed
  // sign-in.
  it('refuses /login itself', () => {
    expect(safeCallbackPath('/login')).toBeNull();
    expect(safeCallbackPath('/login?callbackUrl=%2Fstaff')).toBeNull();
  });
});
