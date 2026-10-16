/**
 * What a number box with a limit on its decimals lets through while somebody
 * types (owner, 2026-10-16): a друкований аркуш is «1,7», never «1,73». The box
 * REFUSES the extra digit rather than drawing a hint, the same rule as the
 * phone, ORCID and ISBN masks.
 *
 * Accepts «,» as well as «.» (a Ukrainian keyboard types the comma) and hands
 * back a plain «.» number, which is what the schema reads.
 */
export function limitDecimals(raw: string, decimals: number): string {
  const out = raw.replace(',', '.').replace(/[^\d.]/g, '');
  const dot = out.indexOf('.');
  if (dot === -1) return out;
  const whole = out.slice(0, dot);
  const fraction = out.slice(dot + 1).replace(/\./g, '');
  if (decimals <= 0) return whole;
  return `${whole}.${fraction.slice(0, decimals)}`;
}

/** Has this number more digits after the point than allowed? Exact, not float-fuzzy. */
export function hasTooManyDecimals(value: number, decimals: number): boolean {
  if (!Number.isFinite(value)) return false;
  const scaled = value * 10 ** decimals;
  return Math.abs(scaled - Math.round(scaled)) > 1e-9;
}
