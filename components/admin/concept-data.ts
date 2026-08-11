/**
 * Sample data shared by every design concept on /admin/design.
 *
 * One copy, so the concepts differ only in how they present the numbers — which
 * is the entire point of putting them side by side. If each held its own rows
 * they would drift, and a comparison of drifting samples compares nothing.
 */

export interface ConceptPerson {
  name: string;
  role: string;
  rating: number;
  stake: number;
  bonus: number;
  trend: number[];
  state: 'ok' | 'warn';
}

export const PEOPLE: ConceptPerson[] = [
  {
    name: 'Бондаренко О. В.',
    role: 'професор, д.ф.-м.н.',
    rating: 8752,
    stake: 0.4,
    bonus: 0.175,
    trend: [42, 46, 44, 51, 58, 62, 71, 78],
    state: 'ok',
  },
  {
    name: 'Ковальчук Н. П.',
    role: 'доцент, к.ф.-м.н.',
    rating: 6410,
    stake: 0.35,
    bonus: 0.35,
    trend: [58, 55, 57, 52, 54, 49, 53, 57],
    state: 'ok',
  },
  {
    name: 'Шевченко І. М.',
    role: 'доцент, к.пед.н.',
    rating: 3155,
    stake: 0.25,
    bonus: 0,
    trend: [40, 38, 35, 36, 31, 29, 28, 26],
    state: 'warn',
  },
  {
    name: 'Мельник А. Ю.',
    role: 'старший викладач',
    rating: 2087,
    stake: 0.15,
    bonus: 0,
    trend: [18, 19, 21, 20, 22, 24, 23, 25],
    state: 'ok',
  },
];

export const TOP_RATING = Math.max(...PEOPLE.map((p) => p.rating));

/** The pool, what is spent of it, and what the untouched formula totals */
export const FUND = { pool: 4.0, spent: 3.1, formula: 4.9 };

/** Ukrainian decimal comma — these numbers are read off a signed document */
export function n(v: number, d = 2) {
  return v.toFixed(d).replace('.', ',');
}

/** Surname initial + given-name initial — «Ковальчук Н. П.» → «КН» */
export function initials(name: string) {
  const [surname, given] = name.split(' ');
  return `${surname[0]}${given?.[0] ?? ''}`.toUpperCase();
}

/** Polyline + closed area path for a small inline trend, sized to the caller */
export function sparkPath(points: number[], w: number, h: number) {
  const hi = Math.max(...points);
  const lo = Math.min(...points);
  const span = hi - lo || 1;
  const xy = points.map((p, i) => {
    const x = (i / (points.length - 1)) * w;
    const y = h - 2 - ((p - lo) / span) * (h - 5);
    return [x, y] as const;
  });
  return {
    line: xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' '),
    last: xy[xy.length - 1],
  };
}
