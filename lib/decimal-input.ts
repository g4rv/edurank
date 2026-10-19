/**
 * What a number box with a limit on its decimals lets through while somebody
 * types (owner, 2026-10-16): a друкований аркуш is «1,7», never «1,73». The box
 * REFUSES the extra digit rather than drawing a hint, the same rule as the
 * phone, ORCID and ISBN masks.
 *
 * Accepts «,» as well as «.» — an English keyboard, or a number pasted from
 * elsewhere, brings the point — and always SHOWS the comma, the Ukrainian
 * decimal separator (owner, 2026-10-19). The schema reads it back
 * (`commaToPoint`).
 */
export function limitDecimals(raw: string, decimals: number): string {
  const out = raw.replace(/[^\d.,]/g, '');
  const at = out.search(/[.,]/);
  if (at === -1) return out;
  const whole = out.slice(0, at);
  const fraction = out.slice(at + 1).replace(/[.,]/g, '');
  if (decimals <= 0) return whole;
  return `${whole},${fraction.slice(0, decimals)}`;
}

/** «4,2» → «4.2» for the schema; anything else passes through */
export function commaToPoint(v: unknown): unknown {
  return typeof v === 'string' ? v.replace(',', '.') : v;
}

/**
 * A number as Ukrainian text — 4.2 → «4,2». For a box showing a saved value and
 * for every line that prints one. Text passes through, so a value already typed
 * into a box keeps what the box made of it.
 */
export function decimalText(v: unknown): string {
  if (typeof v === 'number') return String(v).replace('.', ',');
  return v === undefined || v === null ? '' : String(v);
}

/** Has this number more digits after the point than allowed? Exact, not float-fuzzy. */
export function hasTooManyDecimals(value: number, decimals: number): boolean {
  if (!Number.isFinite(value)) return false;
  const scaled = value * 10 ** decimals;
  return Math.abs(scaled - Math.round(scaled)) > 1e-9;
}
