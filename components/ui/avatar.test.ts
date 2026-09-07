import { describe, it, expect } from 'vitest';
import { initialsOf } from './avatar';

describe('initialsOf', () => {
  it('takes the surname and given-name initials', () => {
    expect(initialsOf('Ковальчук Наталія Петрівна')).toBe('КН');
    expect(initialsOf('Бондаренко Олександр Вікторович')).toBe('БО');
  });

  it('copes with a name that has no patronymic', () => {
    expect(initialsOf('Шевченко Іван')).toBe('ШІ');
  });

  it('copes with a single word', () => {
    expect(initialsOf('Шевченко')).toBe('Ш');
  });

  it('is not confused by extra or leading whitespace', () => {
    // Imported rows have carried double spaces and stray padding before now —
    // a split on a single space produced an empty second initial.
    expect(initialsOf('  Ковальчук   Наталія  ')).toBe('КН');
  });

  it('returns nothing rather than throwing on an empty name', () => {
    expect(initialsOf('')).toBe('');
    expect(initialsOf('   ')).toBe('');
  });
});
