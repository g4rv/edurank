import { describe, expect, it } from 'vitest';
import {
  authorShare,
  coauthorsProblem,
  hoursToInput,
  parseCoauthorRows,
  personMatches,
} from './coauthors';
import { parseStake } from '@/lib/stake/units';

const share = (staffId: string, hoursHundredths: number) => ({ staffId, hoursHundredths });

describe('authorShare', () => {
  it('is what is LEFT after the co-authors — nobody types the author’s own hours', () => {
    expect(authorShare(50000, [])).toBe(50000);
    expect(authorShare(50000, [share('a', 15000), share('b', 10000)])).toBe(25000);
  });
});

describe('coauthorsProblem', () => {
  const ok = (shares: ReturnType<typeof share>[], total = 50000) =>
    coauthorsProblem({ totalHundredths: total, authorStaffId: 'me', shares });

  it('accepts no co-authors, and a split that leaves the author something', () => {
    expect(ok([])).toBeNull();
    expect(ok([share('a', 20000)])).toBeNull();
    expect(ok([share('a', 20000), share('b', 29999)])).toBeNull();
  });

  it('refuses a split that leaves the author nothing — or less than nothing', () => {
    expect(ok([share('a', 50000)])).toMatch(/вам має залишитися/);
    expect(ok([share('a', 30000), share('b', 30000)])).toMatch(/вам має залишитися/);
  });

  it('says how much was given away and how big the pool is', () => {
    expect(ok([share('a', 30000), share('b', 30000)])).toContain('600');
    expect(ok([share('a', 30000), share('b', 30000)])).toContain('500');
  });

  it('refuses hours that are zero, negative or not a whole number of hundredths', () => {
    for (const bad of [0, -100, 12.5]) {
      expect(ok([share('a', bad)]), String(bad)).toMatch(/більше нуля/);
    }
  });

  it('refuses the same person twice', () => {
    expect(ok([share('a', 100), share('a', 200)])).toMatch(/двічі/);
  });

  it('refuses the author as their own co-author', () => {
    expect(ok([share('me', 100)])).toMatch(/власним співавтором/);
  });
});

describe('parseCoauthorRows', () => {
  it('turns the form’s rows into shares, reading «12,5» as well as «12.5»', () => {
    expect(
      parseCoauthorRows([
        { staffId: 'a', hours: '150' },
        { staffId: 'b', hours: '12,5' },
      ])
    ).toEqual({ shares: [share('a', 15000), share('b', 1250)] });
  });

  it('ignores a row nobody has started — no person and no hours', () => {
    expect(parseCoauthorRows([{ staffId: '', hours: '' }])).toEqual({ shares: [] });
  });

  it('asks for the person when only hours were typed', () => {
    expect(parseCoauthorRows([{ staffId: '', hours: '50' }])).toEqual({
      error: 'Оберіть співавтора зі списку',
    });
  });

  it('asks for hours when only a person was chosen', () => {
    expect(parseCoauthorRows([{ staffId: 'a', hours: '' }])).toEqual({
      error: 'Вкажіть, скільки годин отримає співавтор',
    });
  });

  it('refuses hours it cannot read', () => {
    expect(parseCoauthorRows([{ staffId: 'a', hours: 'багато' }])).toEqual({
      error: 'Вкажіть години цифрами, наприклад 50 або 12,5',
    });
  });
});

describe('personMatches — typing a name suggests similar people', () => {
  const person = { name: 'Іваненко Тетяна Дмитрівна', department: 'Кафедра економіки' };

  it('finds by any part of the name, in any case', () => {
    expect(personMatches('іван', person)).toBe(true);
    expect(personMatches('ТЕТЯН', person)).toBe(true);
    expect(personMatches('дмитр', person)).toBe(true);
  });

  it('needs EVERY typed word to match, so a second word narrows the list', () => {
    expect(personMatches('іван тет', person)).toBe(true);
    expect(personMatches('іван олег', person)).toBe(false);
  });

  it('finds by кафедра too', () => {
    expect(personMatches('економік', person)).toBe(true);
  });

  it('shows everybody for an empty search', () => {
    expect(personMatches('', person)).toBe(true);
    expect(personMatches('   ', person)).toBe(true);
  });

  it('treats ’ and ʼ and ' + "'" + ' alike — Ukrainian names are typed with all three', () => {
    expect(personMatches("Д'яч", { name: 'Д’ячук Іван' })).toBe(true);
  });
});

describe('hoursToInput — hours as a person would type them back', () => {
  it('writes whole hours plainly and fractions with a comma', () => {
    expect(hoursToInput(15000)).toBe('150');
    expect(hoursToInput(1250)).toBe('12,5');
    expect(hoursToInput(1205)).toBe('12,05');
    expect(hoursToInput(5)).toBe('0,05');
  });

  it('round-trips through the parser the form uses — what is shown can be saved unchanged', () => {
    for (const hundredths of [15000, 1250, 1205, 5, 99999, 100]) {
      expect(parseStake(hoursToInput(hundredths))).toBe(hundredths);
    }
  });

  it('has no thousands separator — «1 250» would not parse', () => {
    expect(hoursToInput(125000)).toBe('1250');
  });
});
