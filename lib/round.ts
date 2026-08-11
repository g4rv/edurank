/**
 * Two decimals, which is the only precision a rating score ever has.
 *
 * Scores are stored as floats, so adding them accumulates the usual binary
 * dust: `404.17 + 480` is `884.1700000000001`, and a section subtotal built by
 * `reduce` puts that straight on the screen. Rounding each stored value does
 * NOT prevent it — the sum is computed fresh every render, so anywhere a total
 * is added up for display it has to be rounded again there.
 *
 * One copy on purpose. This existed privately in four modules, each rounding
 * its own results correctly, which is exactly why the places that summed
 * without it went unnoticed.
 */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Sum scores and round once at the end — never round then add */
export function sumScores(values: readonly number[]): number {
  return round2(values.reduce((sum, v) => sum + v, 0));
}
