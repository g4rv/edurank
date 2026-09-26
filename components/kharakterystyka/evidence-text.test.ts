import { describe, expect, it } from 'vitest';
import { shortenToken, shortenWords, splitEvidence } from './evidence-text';

/** The п.20 row that started this: 214 characters, one word, no spaces. */
const ANALYTICS =
  'https://spf.uhsp.edu.ua/home/kafedri/kafedra-sotsialnoyi-pedagogiky-i-sotsialnoyi-roboty/?_gl=1%2Aj1lecl%2A_ga%2AMTAwNzIxNjYzNy4xNzYyMzU5NTIz%2A_ga_0GV8419ZP3%2AczE3NjQ1Mjg3MTQkbzMzJGcxJHQxNzY0NTI4NzE4JGo1NiRsMCRoMA..';

describe('splitEvidence', () => {
  it('leaves prose with no link in one piece', () => {
    const text = 'Назва конференції «Формування професіоналізму фахівця» Кількість днів: 2';
    expect(splitEvidence(text)).toEqual([{ text, href: null }]);
  });

  it('pulls the link out of the sentence around it', () => {
    const parts = splitEvidence(`Посилання на сайт ${ANALYTICS} (2025)`);
    expect(parts).toEqual([
      { text: 'Посилання на сайт ', href: null },
      { text: ANALYTICS, href: ANALYTICS },
      { text: ' (2025)', href: null },
    ]);
  });

  // «…конференції https://example.com/page.» — following the full stop gives a
  // 404, and the reader would never see why.
  it('leaves the sentence’s own punctuation out of the address', () => {
    const parts = splitEvidence('Матеріали: https://example.com/page.');
    expect(parts[1]).toEqual({
      text: 'https://example.com/page',
      href: 'https://example.com/page',
    });
    expect(parts[2]).toEqual({ text: '.', href: null });
  });

  it('does the same for a link inside brackets', () => {
    const parts = splitEvidence('(див. https://example.com/a)');
    expect(parts[1].href).toBe('https://example.com/a');
    expect(parts[2].text).toBe(')');
  });

  // The п.20 summaries carry one per конференція, five конференції to a cell.
  it('finds every link in a row of them', () => {
    const parts = splitEvidence('a https://one.test b https://two.test c');
    expect(parts.filter((p) => p.href).map((p) => p.href)).toEqual([
      'https://one.test',
      'https://two.test',
    ]);
  });

  // This DOI is in the document today. Cutting its bracket gives a 404.
  it('keeps a bracket the address opened itself', () => {
    const doi = 'https://doi.org/10.52058/2786-4952-2025-1(47)-1356-1373';
    expect(splitEvidence(doi)).toEqual([{ text: doi, href: doi }]);
  });

  it('still drops the bracket the sentence opened', () => {
    const parts = splitEvidence('(див. https://doi.org/10.52058/2786-4952-2025-1(47))');
    expect(parts[1].href).toBe('https://doi.org/10.52058/2786-4952-2025-1(47)');
    expect(parts[2].text).toBe(')');
  });

  it('keeps a trailing dot that is part of the address itself', () => {
    // The analytics link genuinely ends «..», and both belong to the value.
    const parts = splitEvidence(ANALYTICS);
    expect(parts).toEqual([{ text: ANALYTICS, href: ANALYTICS }]);
  });
});

describe('shortenToken', () => {
  it('leaves a token that fits alone', () => {
    expect(shortenToken('https://example.com/a')).toBe('https://example.com/a');
  });

  it('cuts a long one and says so', () => {
    const short = shortenToken(ANALYTICS);
    expect(short).toHaveLength(56);
    expect(short.endsWith('…')).toBe(true);
    expect(ANALYTICS.startsWith(short.slice(0, -1))).toBe(true);
  });
});

describe('shortenWords', () => {
  it('cuts only the word that is too long', () => {
    const text = `Посилання ${ANALYTICS} готово`;
    const out = shortenWords(text);
    expect(out.startsWith('Посилання ')).toBe(true);
    expect(out.endsWith(' готово')).toBe(true);
    expect(out).toContain('…');
  });

  it('leaves ordinary prose exactly as typed, spacing and all', () => {
    const text = 'Тип участі: заочна (дистанційна)\nКількість днів: 2';
    expect(shortenWords(text)).toBe(text);
  });
});
