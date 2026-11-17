import { describe, expect, it } from 'vitest';
import { EVIDENCE_FIELDS } from '@/lib/rating/evidence-fields';
import { DERIVATIONS_2026 } from './catalogue-2026';
import {
  authorCount,
  entryKeys,
  groupWorks,
  matchesWhen,
  needsCheckCount,
  type WorkEntry,
} from './group-works';

const article = DERIVATIONS_2026['7.1'].from[0];
const monograph = DERIVATIONS_2026['6.1'].from[0];
const patent = DERIVATIONS_2026['13.2'].from[0];

const keysOf = (source: typeof article, evidence: Record<string, unknown>) =>
  entryKeys(source, EVIDENCE_FIELDS[source.code], evidence);

const entry = (staffId: string, keys: string[], text = `Текст ${staffId}`): WorkEntry => ({
  staffId,
  staffName: `Особа ${staffId}`,
  keys,
  text,
});

describe('matchesWhen', () => {
  it('takes only the options the line names', () => {
    expect(matchesWhen(article, { option: 'q1' })).toBe(true);
    expect(matchesWhen(article, { option: 'q3_4' })).toBe(false);
    expect(matchesWhen(article, {})).toBe(false);
  });

  it('takes everything when the line names no option', () => {
    expect(matchesWhen(patent, {})).toBe(true);
  });
});

describe('entryKeys', () => {
  it('reads one DOI however it was typed', () => {
    const bare = keysOf(article, { doi: '10.1000/ABC123' });
    const asUrl = keysOf(article, { doi: 'https://doi.org/10.1000/abc123' });
    expect(bare).toEqual(['doi:10.1000/abc123']);
    expect(asUrl).toEqual(bare);
  });

  it('reads a DOI pasted into the link box as that DOI', () => {
    expect(keysOf(article, { link: 'https://doi.org/10.1000/abc123' })).toEqual([
      'doi:10.1000/abc123',
    ]);
  });

  it('reads a link without its scheme, www or trailing slash', () => {
    expect(
      keysOf(article, { link: 'https://www.Scopus.com/record/display.uri?eid=2-s2.0-1/' })
    ).toEqual(['link:scopus.com/record/display.uri?eid=2-s2.0-1']);
  });

  it('folds ISBN-10 and ISBN-13 of one book into one key', () => {
    expect(keysOf(monograph, { isbn: '0-306-40615-2' })).toEqual(['isbn:9780306406157']);
    expect(keysOf(monograph, { isbn: '978-0-306-40615-7' })).toEqual(['isbn:9780306406157']);
  });

  it('gives no key for an identifier that is not valid', () => {
    expect(keysOf(monograph, { isbn: '978-0-306-40615-8' })).toEqual([]);
    expect(keysOf(article, { doi: 'немає' })).toEqual([]);
  });

  it('keeps only letters and digits of a number', () => {
    expect(keysOf(patent, { registrationNumber: '№ 123-45' })).toEqual(['number:12345']);
  });
});

describe('groupWorks', () => {
  it('counts a work two co-authors entered once', () => {
    const works = groupWorks([entry('a', ['isbn:1']), entry('b', ['isbn:1'])]);
    expect(works).toHaveLength(1);
    expect(works[0]).toMatchObject({ entryCount: 2, matchedBy: 'isbn' });
    expect(works[0].authors.map((a) => a.staffId)).toEqual(['a', 'b']);
  });

  it('joins through a chain of keys', () => {
    const works = groupWorks([
      entry('a', ['doi:x']),
      entry('b', ['doi:x', 'link:y']),
      entry('c', ['link:y']),
    ]);
    expect(works).toHaveLength(1);
    expect(works[0]).toMatchObject({ entryCount: 3, matchedBy: 'doi' });
  });

  it('keeps entries with different keys apart', () => {
    expect(groupWorks([entry('a', ['isbn:1']), entry('b', ['isbn:2'])])).toHaveLength(2);
  });

  it('lists each author once when one person entered a work twice', () => {
    const [work] = groupWorks([entry('a', ['doi:x']), entry('a', ['doi:x'])]);
    expect(work.authors).toHaveLength(1);
    expect(work.entryCount).toBe(2);
  });

  it('joins the same title typed with other case, quotes or a dot, with no check needed', () => {
    const works = groupWorks([
      entry('a', [], 'Професійна підготовка майбутніх фахівців в умовах інтернаціоналізації'),
      entry('b', [], '«Професійна підготовка майбутніх фахівців в умовах інтернаціоналізації»;'),
      entry('c', [], 'ПРОФЕСІЙНА ПІДГОТОВКА МАЙБУТНІХ ФАХІВЦІВ В УМОВАХ ІНТЕРНАЦІОНАЛІЗАЦІЇ.'),
    ]);
    expect(works).toHaveLength(1);
    expect(works[0]).toMatchObject({
      entryCount: 3,
      matchedBy: 'title',
      needsCheck: false,
      variants: [],
    });
    expect(works[0].authors.map((a) => a.staffId)).toEqual(['a', 'b', 'c']);
  });

  it('joins alike texts but marks them for a check, keeping every spelling', () => {
    const works = groupWorks([
      entry('a', [], 'Іваненко О. Основи теорії управління освітою. Київ, 2026. 200 с.'),
      entry('b', [], 'Іваненко О.О. Основи теорії управління освітою. Київ, 2026. 200 с.'),
      entry('c', [], 'Петренко П. Методика викладання хімії у школі. Львів, 2025.'),
    ]);
    expect(works).toHaveLength(2);
    expect(works[0]).toMatchObject({ entryCount: 2, matchedBy: 'similar', needsCheck: true });
    expect(works[0].variants).toHaveLength(2);
    expect(works[1].needsCheck).toBe(false);
    expect(needsCheckCount(works)).toBe(1);
  });

  it('never joins by text two entries whose identifiers differ', () => {
    const title = 'Основи теорії управління освітою: монографія';
    const works = groupWorks([entry('a', ['isbn:1'], title), entry('b', ['isbn:2'], title)]);
    expect(works).toHaveLength(2);
  });

  it('joins by text an entry with a key and one without', () => {
    const title = 'Основи теорії управління освітою: монографія';
    const works = groupWorks([entry('a', ['isbn:1'], title), entry('b', [], title)]);
    expect(works).toHaveLength(1);
    expect(works[0].matchedBy).toBe('title');
  });

  it('does not join a part 1 and a part 2', () => {
    const works = groupWorks([
      entry('a', [], 'Методика навчання хімії у закладах освіти. Частина 1'),
      entry('b', [], 'Методика навчання хімії у закладах освіти. Частина 2'),
    ]);
    expect(works).toHaveLength(2);
  });

  it('counts each author once across the works', () => {
    const works = groupWorks([
      entry('a', ['isbn:1']),
      entry('b', ['isbn:1']),
      entry('a', ['isbn:2']),
    ]);
    expect(authorCount(works)).toBe(2);
  });

  it('has no match kind for a work of one entry', () => {
    expect(groupWorks([entry('a', ['isbn:1'])])[0].matchedBy).toBeNull();
  });

  it('is empty for no entries', () => {
    expect(groupWorks([])).toEqual([]);
  });
});
