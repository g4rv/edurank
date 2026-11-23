import type { Prisma } from '@/lib/generated/prisma/client';
import {
  evidenceDisciplineKey,
  hasDisciplineField,
  missingDisciplines,
  type AssignedName,
} from '@/lib/disciplines/assigned';
import { evidenceFieldsSpecSchema } from '@/validations/activity-type-spec';

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
 *
 * **Assigned disciplines** (owner, 2026-11-19): a person the departments gave
 * disciplines for the year (`AssignedDiscipline`) answers a gating indicator
 * that asks for a discipline (`fromDisciplines`) once for EACH of them. One
 * entry no longer opens it; «Я лектор» off on an entry still answers that
 * discipline. A person with none keeps the one-entry rule. `evaluateGate` is the
 * one place this is decided.
 */

export interface GatingType {
  id: string;
  itemNumber: string;
  sectionNumber: number;
}

export type RatingGate =
  | { open: true }
  | {
      open: false;
      missing: GatingType[];
      /** Assigned disciplines no entry names yet, as assigned. Absent without a list. */
      missingDisciplines?: string[];
    };

export function ratingGate(input: {
  gatingTypes: readonly GatingType[];
  /** Indicator ids the person already has a counted entry of, this year */
  filledTypeIds: ReadonlySet<string>;
}): RatingGate {
  const missing = input.gatingTypes.filter((t) => !input.filledTypeIds.has(t.id));
  return missing.length === 0 ? { open: true } : { open: false, missing };
}

/** A gating indicator, plus whether it asks for a discipline chosen from the list */
export interface GatingRow extends GatingType {
  byDiscipline: boolean;
}

/**
 * One person against the gate, no database. `entries` maps an indicator id to
 * the evidence of the person's counted entries of it.
 */
export function evaluateGate(input: {
  gating: readonly GatingRow[];
  assigned: readonly AssignedName[];
  entries: ReadonlyMap<string, readonly unknown[]>;
}): RatingGate {
  const missing: GatingType[] = [];
  const names: AssignedName[] = [];
  for (const g of input.gating) {
    const evidences = input.entries.get(g.id) ?? [];
    const gate: GatingType = { id: g.id, itemNumber: g.itemNumber, sectionNumber: g.sectionNumber };
    if (g.byDiscipline && input.assigned.length > 0) {
      const gaps = missingDisciplines(input.assigned, evidences);
      if (gaps.length > 0) {
        missing.push(gate);
        for (const n of gaps) {
          if (!names.some((x) => x.nameNormalised === n.nameNormalised)) names.push(n);
        }
      }
    } else if (evidences.length === 0) {
      missing.push(gate);
    }
  }
  if (missing.length === 0) return { open: true };
  return names.length > 0
    ? { open: false, missing, missingDisciplines: names.map((n) => n.name) }
    : { open: false, missing };
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

/** Does an indicator's stored field spec ask for a discipline chosen from the list? */
function asksForDiscipline(evidenceFields: unknown): boolean {
  const parsed = evidenceFieldsSpecSchema.safeParse(evidenceFields);
  return parsed.success && hasDisciplineField(parsed.data);
}

/** The year's gating indicators, in the order the person meets them */
async function loadGatingRows(tx: Prisma.TransactionClient, year: number): Promise<GatingRow[]> {
  const gating = await tx.activityType.findMany({
    where: { gatesRating: true, isActive: true, template: { year } },
    select: {
      id: true,
      itemNumber: true,
      evidenceFields: true,
      section: { select: { number: true } },
    },
    orderBy: [{ section: { number: 'asc' } }, { order: 'asc' }],
  });
  return gating.map((g) => ({
    id: g.id,
    itemNumber: g.itemNumber,
    sectionNumber: g.section.number,
    byDiscipline: asksForDiscipline(g.evidenceFields),
  }));
}

/** Everything `evaluateGate` needs for each of these people, in two queries */
async function loadGateInputs(
  tx: Prisma.TransactionClient,
  staffIds: readonly string[],
  year: number,
  gating: readonly GatingRow[]
): Promise<Map<string, { assigned: AssignedName[]; entries: Map<string, unknown[]> }>> {
  const out = new Map<string, { assigned: AssignedName[]; entries: Map<string, unknown[]> }>();
  for (const id of staffIds) out.set(id, { assigned: [], entries: new Map() });
  if (staffIds.length === 0 || gating.length === 0) return out;

  const [assigned, activities] = await Promise.all([
    tx.assignedDiscipline.findMany({
      where: { staffId: { in: [...staffIds] }, year },
      select: { staffId: true, name: true, nameNormalised: true },
      orderBy: { name: 'asc' },
    }),
    tx.activity.findMany({
      where: {
        staffId: { in: [...staffIds] },
        year,
        activityTypeId: { in: gating.map((g) => g.id) },
        ...COUNTED,
      },
      select: { staffId: true, activityTypeId: true, evidence: true },
    }),
  ]);
  for (const a of assigned) {
    out.get(a.staffId)?.assigned.push({ name: a.name, nameNormalised: a.nameNormalised });
  }
  for (const a of activities) {
    const entries = out.get(a.staffId)?.entries;
    if (!entries) continue;
    const list = entries.get(a.activityTypeId) ?? [];
    list.push(a.evidence);
    entries.set(a.activityTypeId, list);
  }
  return out;
}

/**
 * Of these people, who has NOT yet filled every gating indicator of `year`?
 * Empty when the year has no gating indicator. Two queries for everybody, for
 * the bulk recompute.
 */
export async function blockedStaff(
  tx: Prisma.TransactionClient,
  staffIds: readonly string[],
  year: number
): Promise<Set<string>> {
  if (staffIds.length === 0) return new Set();
  const gating = await loadGatingRows(tx, year);
  if (gating.length === 0) return new Set();

  const inputs = await loadGateInputs(tx, staffIds, year, gating);
  return new Set(
    staffIds.filter((id) => {
      const input = inputs.get(id)!;
      return !evaluateGate({ gating, ...input }).open;
    })
  );
}

/** The gate for one person in the year of the given template */
export async function loadRatingGate(
  tx: Prisma.TransactionClient,
  staffId: string,
  year: number
): Promise<RatingGate> {
  const gating = await loadGatingRows(tx, year);
  if (gating.length === 0) return { open: true };
  const inputs = await loadGateInputs(tx, [staffId], year, gating);
  return evaluateGate({ gating, ...inputs.get(staffId)! });
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

/** One person's standing on the disciplines rule, for the admin list */
export interface DisciplineStanding {
  staffId: string;
  assigned: number;
  /** Assigned disciplines with an entry */
  done: number;
  /** Assigned disciplines still without one, as assigned */
  missing: string[];
  /** Entries on an assigned discipline marked «Не лектор» */
  notLecturer: string[];
}

/**
 * Everyone with disciplines assigned for `year`, and how far each one is
 * (owner, 2026-11-19). For the admin and ННВ page: the missing ones are who the
 * close will zero, the «не лектор» ones are what to look at before it.
 */
export async function listDisciplineStandings(
  tx: Prisma.TransactionClient,
  year: number
): Promise<DisciplineStanding[]> {
  const gating = (await loadGatingRows(tx, year)).filter((g) => g.byDiscipline);
  if (gating.length === 0) return [];

  const assigned = await tx.assignedDiscipline.findMany({
    // Only people who can fill 5.1: not archived, an НПП, not outside the rating
    // (зовнішній сумісник, 2026-11-10)
    where: { year, staff: { archivedAt: null, isNpp: true, isExternalPartTimer: false } },
    select: { staffId: true, name: true, nameNormalised: true },
    orderBy: { name: 'asc' },
  });
  const staffIds = [...new Set(assigned.map((a) => a.staffId))];
  const activities = await tx.activity.findMany({
    where: {
      staffId: { in: staffIds },
      year,
      activityTypeId: { in: gating.map((g) => g.id) },
      ...COUNTED,
    },
    select: { staffId: true, evidence: true },
  });

  const evidenceBy = new Map<string, unknown[]>();
  for (const a of activities) {
    const list = evidenceBy.get(a.staffId) ?? [];
    list.push(a.evidence);
    evidenceBy.set(a.staffId, list);
  }
  const namesBy = new Map<string, AssignedName[]>();
  for (const a of assigned) {
    const list = namesBy.get(a.staffId) ?? [];
    list.push({ name: a.name, nameNormalised: a.nameNormalised });
    namesBy.set(a.staffId, list);
  }

  return staffIds.map((staffId) => {
    const names = namesBy.get(staffId) ?? [];
    const evidences = evidenceBy.get(staffId) ?? [];
    const missing = missingDisciplines(names, evidences).map((n) => n.name);
    const off = new Set(
      evidences
        .filter((e) => (e as { isLecturer?: unknown } | null)?.isLecturer !== true)
        .map((e) => String((e as { discipline?: unknown } | null)?.discipline ?? ''))
    );
    return {
      staffId,
      assigned: names.length,
      done: names.length - missing.length,
      missing,
      notLecturer: names.filter((n) => off.has(n.name)).map((n) => n.name),
    };
  });
}

/** One assigned discipline on the person's own checklist */
export interface DisciplineItem {
  name: string;
  /** An entry names it */
  done: boolean;
  /** …and says «Не лектор» */
  notLecturer: boolean;
}

/**
 * The person's assigned disciplines and which of them already have an entry —
 * the checklist on Розділ 5 and the choices left in the form. Empty without a
 * list (the old rule applies).
 */
export async function loadDisciplineProgress(
  tx: Prisma.TransactionClient,
  staffId: string,
  year: number
): Promise<DisciplineItem[]> {
  const gating = (await loadGatingRows(tx, year)).filter((g) => g.byDiscipline);
  if (gating.length === 0) return [];
  const inputs = (await loadGateInputs(tx, [staffId], year, gating)).get(staffId)!;
  if (inputs.assigned.length === 0) return [];

  const evidences = gating.flatMap((g) => inputs.entries.get(g.id) ?? []);
  const gaps = new Set(missingDisciplines(inputs.assigned, evidences).map((n) => n.nameNormalised));
  const lecturerOff = new Set(
    evidences
      .filter((e) => (e as { isLecturer?: unknown } | null)?.isLecturer !== true)
      .map((e) => evidenceDisciplineKey(e))
  );
  return inputs.assigned.map((a) => ({
    name: a.name,
    done: !gaps.has(a.nameNormalised),
    notLecturer: lecturerOff.has(a.nameNormalised),
  }));
}
