import type { Prisma } from '@/lib/generated/prisma/client';

/**
 * 5.1 is mandatory, and it is judged when the year CLOSES (owner, 2026-10-19,
 * replacing 2026-10-16's «nothing else opens until 5.1 is filled»).
 *
 * Every НПП answers 5.1 — «Я лектор» on with the course and its evidence, or
 * off. While the year is open nothing waits for it: every section can be
 * filled, and the year total adds up as usual. Розділ 5 warns while it is
 * empty, «Мій рейтинг» and the Excel form say so beside the total.
 *
 * When the year closes (`closeYear`), whoever has no entry of it scores 0 for
 * the year — the frozen snapshot AND the stored totals the rankings read,
 * entries a division entered for them included. Reopening the year recomputes
 * everyone, so a late 5.1 still brings every point back before it closes again.
 *
 * Which indicator is mandatory is a COLUMN, `ActivityType.gatesRating` — never
 * a code — like `requiresVerification` and `entityFirstEntry`. With several such
 * indicators in a year, each needs an entry. A year with none has no such rule
 * (2025, or an admin who switches it off).
 */

export interface GatingType {
  id: string;
  itemNumber: string;
  sectionNumber: number;
}

export type RatingGate = { open: true } | { open: false; missing: GatingType[] };

export function ratingGate(input: {
  gatingTypes: readonly GatingType[];
  /** Indicator ids the person already has a counted entry of, this year */
  filledTypeIds: ReadonlySet<string>;
}): RatingGate {
  const missing = input.gatingTypes.filter((t) => !input.filledTypeIds.has(t.id));
  return missing.length === 0 ? { open: true } : { open: false, missing };
}

/** The warning beside an empty 5.1 — what happens to the year without it */
export function ratingGateDetail(missing: readonly GatingType[]): string {
  const where =
    missing.length === 1
      ? `П. ${missing[0].itemNumber} обов’язковий`
      : `Пункти ${missing.map((t) => t.itemNumber).join(', ')} обов’язкові`;
  return (
    `${where}: якщо не заповнити до закриття рейтингового року, ` +
    'бали за всі інші пункти не буде зараховано.'
  );
}

/** Only APPROVED rows of an active indicator open it — the same rows that count */
const COUNTED = { status: 'APPROVED', activityType: { isActive: true } } as const;

/**
 * Of these people, who has NOT yet filled every gating indicator of `year`?
 * Empty when the year has no gating indicator. One query each way, for the
 * bulk recompute.
 */
export async function blockedStaff(
  tx: Prisma.TransactionClient,
  staffIds: readonly string[],
  year: number
): Promise<Set<string>> {
  if (staffIds.length === 0) return new Set();
  const gating = await tx.activityType.findMany({
    where: { gatesRating: true, isActive: true, template: { year } },
    select: { id: true },
  });
  if (gating.length === 0) return new Set();

  const filled = await tx.activity.findMany({
    where: {
      staffId: { in: [...staffIds] },
      year,
      activityTypeId: { in: gating.map((g) => g.id) },
      ...COUNTED,
    },
    select: { staffId: true, activityTypeId: true },
    distinct: ['staffId', 'activityTypeId'],
  });
  const count = new Map<string, number>();
  for (const f of filled) count.set(f.staffId, (count.get(f.staffId) ?? 0) + 1);
  return new Set(staffIds.filter((id) => (count.get(id) ?? 0) < gating.length));
}

/** The gate for one person in the year of the given template */
export async function loadRatingGate(
  tx: Prisma.TransactionClient,
  staffId: string,
  year: number
): Promise<RatingGate> {
  const gating = await tx.activityType.findMany({
    where: { gatesRating: true, isActive: true, template: { year } },
    select: { id: true, itemNumber: true, section: { select: { number: true } } },
    orderBy: [{ section: { number: 'asc' } }, { order: 'asc' }],
  });
  if (gating.length === 0) return { open: true };

  const filled = await tx.activity.findMany({
    where: { staffId, year, activityTypeId: { in: gating.map((g) => g.id) }, ...COUNTED },
    select: { activityTypeId: true },
  });
  return ratingGate({
    gatingTypes: gating.map((g) => ({
      id: g.id,
      itemNumber: g.itemNumber,
      sectionNumber: g.section.number,
    })),
    filledTypeIds: new Set(filled.map((f) => f.activityTypeId)),
  });
}

/**
 * For the sidebar: the sections made ONLY of indicators that open the rating
 * (Розділ 5 is 5.1 alone), each with whether the person has filled it. Such a
 * section has no number to show — its total is always 0.
 */
export async function gatingSectionMarks(
  tx: Prisma.TransactionClient,
  staffId: string,
  year: number
): Promise<Record<number, boolean>> {
  const types = await tx.activityType.findMany({
    where: { isActive: true, template: { year } },
    select: { gatesRating: true, section: { select: { number: true } } },
  });
  const sections = new Map<number, boolean>();
  for (const t of types) {
    const n = t.section.number;
    sections.set(n, (sections.get(n) ?? true) && t.gatesRating);
  }
  const gatingOnly = [...sections].filter(([, all]) => all).map(([n]) => n);
  if (gatingOnly.length === 0) return {};
  const done = (await loadRatingGate(tx, staffId, year)).open;
  return Object.fromEntries(gatingOnly.map((n) => [n, done]));
}
