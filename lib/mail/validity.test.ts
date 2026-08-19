import { describe, expect, it } from 'vitest';
import { pluralUk, validityPhrase } from './validity';

describe('pluralUk', () => {
  it('picks the singular for 1, but not for 11', () => {
    expect(pluralUk(1, 'день', 'дні', 'днів')).toBe('день');
    expect(pluralUk(21, 'день', 'дні', 'днів')).toBe('день');
    expect(pluralUk(11, 'день', 'дні', 'днів')).toBe('днів');
  });

  it('picks the few form for 2–4, but not for 12–14', () => {
    expect(pluralUk(2, 'день', 'дні', 'днів')).toBe('дні');
    expect(pluralUk(23, 'день', 'дні', 'днів')).toBe('дні');
    expect(pluralUk(13, 'день', 'дні', 'днів')).toBe('днів');
  });

  it('picks the many form for everything else', () => {
    expect(pluralUk(5, 'день', 'дні', 'днів')).toBe('днів');
    expect(pluralUk(30, 'день', 'дні', 'днів')).toBe('днів');
    expect(pluralUk(0, 'день', 'дні', 'днів')).toBe('днів');
  });
});

describe('validityPhrase', () => {
  it('says whole days in days', () => {
    expect(validityPhrase(30 * 24)).toBe('30 днів');
    expect(validityPhrase(24)).toBe('1 день');
    expect(validityPhrase(48)).toBe('2 дні');
  });

  it('says anything shorter in hours', () => {
    expect(validityPhrase(2)).toBe('2 години');
    expect(validityPhrase(1)).toBe('1 година');
    expect(validityPhrase(12)).toBe('12 годин');
  });

  // 36 hours is a day and a half — «1 день» would overstate it by half a day
  it('keeps a part-day in hours rather than rounding it', () => {
    expect(validityPhrase(36)).toBe('36 годин');
  });
});
