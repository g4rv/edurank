import { describe, expect, it } from 'vitest';
import { nameSearch } from './name-search';

const NAME = ['lastName', 'firstName', 'patronymic'] as const;

/** The OR branches for one word, as plain field→value pairs */
function branches(where: unknown, index: number) {
  const and = (where as { AND: { OR: Record<string, { contains: string }>[] }[] }).AND;
  return and[index].OR.map((clause) => {
    const [field, matcher] = Object.entries(clause)[0];
    return { field, contains: matcher.contains };
  });
}

const wordCount = (where: unknown) => (where as { AND: unknown[] }).AND.length;

describe('nameSearch', () => {
  // The bug, reported on production: «Ігнатенко» found her and «Ігнатенко
  // Микола» found nobody, because the whole string was tested against each
  // column on its own.
  it('splits a full name so every word is matched separately', () => {
    const where = nameSearch('Ігнатенко Микола', NAME);
    expect(wordCount(where)).toBe(2);
    expect(branches(where, 0).map((b) => b.contains)).toEqual([
      'Ігнатенко',
      'Ігнатенко',
      'Ігнатенко',
    ]);
    expect(branches(where, 1).map((b) => b.contains)).toEqual(['Микола', 'Микола', 'Микола']);
  });

  it('lets each word match a different column, in either order', () => {
    // Both orderings produce the same set of words to satisfy, so the surname
    // may land in lastName and the given name in firstName either way round.
    const forward = nameSearch('Ігнатенко Микола', NAME);
    const reversed = nameSearch('Микола Ігнатенко', NAME);
    const words = (w: unknown) => [branches(w, 0)[0].contains, branches(w, 1)[0].contains].sort();
    expect(words(forward)).toEqual(words(reversed));
  });

  it('checks every field for each word', () => {
    const where = nameSearch('Ігнатенко', NAME);
    expect(branches(where, 0).map((b) => b.field)).toEqual(['lastName', 'firstName', 'patronymic']);
  });

  it('searches one word exactly as it always did', () => {
    const where = nameSearch('Ігнатенко', NAME);
    expect(wordCount(where)).toBe(1);
  });

  it('takes the extra fields the staff list searches on', () => {
    const where = nameSearch('kovalenko@uhsp.edu.ua', [...NAME, 'email', 'orcidId']);
    expect(branches(where, 0).map((b) => b.field)).toContain('email');
    expect(branches(where, 0).map((b) => b.field)).toContain('orcidId');
  });

  it('collapses the spaces a paste brings with it', () => {
    expect(wordCount(nameSearch('  Ігнатенко   Микола  ', NAME))).toBe(2);
  });

  // An empty box must not become a condition that matches nothing.
  it('is undefined for an empty or blank query', () => {
    expect(nameSearch('', NAME)).toBeUndefined();
    expect(nameSearch('   ', NAME)).toBeUndefined();
  });

  it('matches case-insensitively', () => {
    const where = nameSearch('ігнатенко', NAME);
    const clause = (where as { AND: { OR: Record<string, { mode: string }>[] }[] }).AND[0].OR[0];
    expect(Object.values(clause)[0].mode).toBe('insensitive');
  });
});
