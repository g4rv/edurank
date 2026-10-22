// «Топ-20 НПП», the pure half: who is on the list for each показник. Its own
// file because the card (a client component) needs the types and the count, and
// `lib/queries/get-top-staff.ts` imports the database.

export const TOP_STAFF_COUNT = 20;

/** The показники the card can rank by: the total, or a розділ 1–5 — the keys of its select */
export const METRIC_KEYS = ['total', '1', '2', '3', '4', '5'] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];

export interface StaffScores {
  id: string;
  name: string;
  /** Home кафедра and факультет — the primary one, or the part-time one for somebody with no primary */
  department: string | null;
  faculty: string | null;
  /** section1..5 scores */
  sections: number[];
  total: number;
}

export interface TopStaffRow {
  id: string;
  name: string;
  department: string | null;
  faculty: string | null;
  /** The chosen показник's score */
  value: number;
  /** The year's total, shown beside a розділ */
  total: number;
}

export type TopByMetric = Record<MetricKey, TopStaffRow[]>;

const valueOf = (p: StaffScores, key: MetricKey) =>
  key === 'total' ? p.total : (p.sections[Number(key) - 1] ?? 0);

/**
 * The best `count` people for every показник, highest first. Two people level on
 * it are ordered by their total, then by name, as every ranking here does, and
 * nobody with nothing in a показник is on its list.
 *
 * One pass over the people per показник — 6 sorts of a few hundred rows, which
 * is why all six lists are built at once and the select just picks one.
 */
export function topPerMetric(people: StaffScores[], count = TOP_STAFF_COUNT): TopByMetric {
  const lists = {} as TopByMetric;
  for (const key of METRIC_KEYS) {
    lists[key] = people
      .map((p) => ({
        id: p.id,
        name: p.name,
        department: p.department,
        faculty: p.faculty,
        value: valueOf(p, key),
        total: p.total,
      }))
      .filter((p) => p.value > 0)
      .sort((a, b) => b.value - a.value || b.total - a.total || a.name.localeCompare(b.name, 'uk'))
      .slice(0, count);
  }
  return lists;
}

/** The select's wording for each показник — one copy for the card, the Excel and the PDF */
export const METRIC_LABELS: Record<MetricKey, string> = {
  total: 'Загальний бал',
  '1': 'Розділ 1 — професійний розвиток',
  '2': 'Розділ 2 — навчальна діяльність',
  '3': 'Розділ 3 — науково-інноваційна діяльність',
  '4': 'Розділ 4 — організаційна діяльність',
  '5': 'Розділ 5 — навчально-методичне забезпечення',
};

export const isMetricKey = (value: string | null): value is MetricKey =>
  value !== null && (METRIC_KEYS as readonly string[]).includes(value);
