import { describe, it, expect } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('ignores falsy values', () => {
    expect(cn('foo', false && 'bar', undefined, null)).toBe('foo');
  });

  it('resolves tailwind conflicts — last one wins', () => {
    expect(cn('p-4', 'p-8')).toBe('p-8');
  });
});
