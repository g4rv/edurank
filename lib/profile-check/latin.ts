/**
 * Is a name written in Latin letters? ORCID and Google Scholar both want the
 * name that way. Cyrillic letters drawn exactly like Latin ones («а», «о», «р»…)
 * pass the eye and fail every search, so they are told apart from real Cyrillic.
 */
const LATIN_RE = /^[A-Za-z\s\-'.,]+$/;

const LOOKALIKES: Record<string, string> = {
  а: 'a',
  е: 'e',
  о: 'o',
  р: 'p',
  с: 'c',
  х: 'x',
  і: 'i',
  А: 'A',
  В: 'B',
  Е: 'E',
  О: 'O',
  Р: 'P',
  С: 'C',
  Х: 'X',
  М: 'M',
  Н: 'H',
  Т: 'T',
  К: 'K',
  У: 'Y',
};

export type LatinKind = 'latin' | 'lookalike' | 'other';

export function latinKind(text: string): LatinKind {
  if (LATIN_RE.test(text)) return 'latin';
  const folded = [...text].map((c) => LOOKALIKES[c] ?? c).join('');
  return LATIN_RE.test(folded) ? 'lookalike' : 'other';
}

/**
 * A text cut into runs of Cyrillic and non-Cyrillic letters, so a screen can
 * show a lookalike («ORСID» with a Cyrillic С) in bold. Only for a MIXED text:
 * a wholly Cyrillic name is plainly Cyrillic and nothing needs pointing at.
 */
export function cyrillicRuns(text: string): { text: string; cyrillic: boolean }[] | null {
  const hasLatin = /[A-Za-z]/.test(text);
  const hasCyrillic = /[\u0400-\u04FF]/.test(text);
  if (!hasLatin || !hasCyrillic) return null;
  return text
    .split(/([\u0400-\u04FF]+)/)
    .filter(Boolean)
    .map((part) => ({ text: part, cyrillic: /[\u0400-\u04FF]/.test(part) }));
}
