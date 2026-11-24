/**
 * Are two typed descriptions of a work the SAME work? (owner, 2026-11-13)
 *
 * Asked only for two works that already share a LINK — see `findSimilarWork`.
 * An ordinary address does not say which work it is: two authors printed in
 * one збірник share its page. The description does, but it is free text, so
 * a copy is never typed the same way twice — another author prefix, another
 * comma, a typo. Hence a comparison of WORDS, not of the string.
 *
 * Deliberately generous to a copy and strict about everything else:
 *  - a work is a copy when at least {@link COPY_SHARE} of the SHORTER text's
 *    words are in the longer one — so adding or dropping an author prefix
 *    still scores 100%, where an overlap of both texts would not;
 *  - two printed page ranges that differ mean two articles, whatever the
 *    words say — the tail «Збірник … Переяслав, 2026.» is shared by every
 *    article of one збірник and would otherwise look like a match;
 *  - so does any number each text has and the other lacks (part, volume,
 *    year). The cost: a copy with a mistyped page number reads as another
 *    article and saves — a moderator's to catch, as before;
 *  - a text of fewer than {@link MIN_WORDS} words is compared whole, because a
 *    short phrase inside a longer title is no evidence of anything.
 */
export const COPY_SHARE = 0.9;
export const MIN_WORDS = 4;

/**
 * An apostrophe is PART of a Ukrainian word, never a separator (owner,
 * 2026-11-24): «здоров’язбережувальної», «здоровя'збережувальної» and
 * «здоров'язбережувальної» are one word typed three ways. Split at it, each
 * spelling gave two words the other lacked, and one slip in a 19-word title
 * scored 0.89 — under {@link COPY_SHARE} — so a кафедра's report counted one
 * topic twice. The apostrophes of every spelling (straight, curly, modifier
 * letter, grave, acute, prime) are dropped before the text is split into words.
 */
const APOSTROPHES = /['’ʼ`‘´′]/g;

function wordsOf(raw: string): string[] {
  return (
    raw
      .toLowerCase()
      .replace(APOSTROPHES, '')
      .match(/[\p{L}\p{N}]+/gu) ?? []
  );
}

/** «С. 118-120», «с.118–120», «pp. 5-9» — the first range printed in the text. */
function pageRangeOf(raw: string): string | null {
  const m = /(?:^|[^\p{L}])(?:с|c|p|pp|стор)\.?\s*(\d+)\s*[-–—]\s*(\d+)/iu.exec(raw);
  return m ? `${m[1]}-${m[2]}` : null;
}

export function sameWorkByText(a: string, b: string): boolean {
  const pagesA = pageRangeOf(a);
  const pagesB = pageRangeOf(b);
  if (pagesA && pagesB && pagesA !== pagesB) return false;

  const setA = new Set(wordsOf(a));
  const setB = new Set(wordsOf(b));

  // A number that EACH side has and the other lacks is a different part, volume
  // or year — «Частина 1» / «Частина 2» differ by one word, well under the
  // threshold. A number on one side only (pages or a year left out) is how a
  // copy is retyped, and stays a match.
  const isNumber = (w: string) => /^\d+$/.test(w);
  const onlyInA = [...setA].some((w) => isNumber(w) && !setB.has(w));
  const onlyInB = [...setB].some((w) => isNumber(w) && !setA.has(w));
  if (onlyInA && onlyInB) return false;

  const [shorter, longer] = setA.size <= setB.size ? [setA, setB] : [setB, setA];
  if (shorter.size === 0) return false;

  if (shorter.size < MIN_WORDS) {
    return shorter.size === longer.size && [...shorter].every((w) => longer.has(w));
  }
  let shared = 0;
  for (const w of shorter) if (longer.has(w)) shared++;
  return shared / shorter.size >= COPY_SHARE;
}
