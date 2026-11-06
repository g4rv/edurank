import { describe, expect, it } from 'vitest';
import { emptyCellText } from './labels';

describe('emptyCellText', () => {
  it('tells a never-checked profile from one the person has not entered', () => {
    expect(emptyCellText('https://orcid.org/0000-0000-0000-0000')).toBe('Не перевіряли');
    expect(emptyCellText(null)).toBe('Немає посилання');
    expect(emptyCellText('  ')).toBe('Немає посилання');
  });
});
