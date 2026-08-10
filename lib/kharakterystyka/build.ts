// Builds one person's Характеристика from rating data — pure, no DB, no UI.
//
// The whole design in one line: **this is a view of the rating, not a second
// place to type.** Nobody re-enters anything already submitted; each position of
// п.38 is derived from the entries that satisfy it, and the evidence text is the
// same `summarizeEvidence` output the app already shows elsewhere, with the year
// appended — which is exactly the format of the document they produce by hand
// today (`edu-reference/csv/… - Характеристика_РНПАВ.csv`).
//
// Consequences worth knowing before changing anything here:
//
// - **Generated text is never editable** (decided 2026-08-07). There is no
//   override field and nothing is stored per person. If a sentence reads badly
//   the fix is in the generator, for everybody at once. An editable document
//   could assert something the underlying entries do not support.
// - **Nothing throws.** A malformed indicator row feeds no position instead of
//   taking the document down; a person with no data gets twenty empty rows,
//   which is the honest answer and also the starting state for everybody.

import type { ActivityStatus, ScientificDegree } from '@/lib/generated/prisma/client';
import { summarizeEvidence, type EvidenceField } from '@/lib/rating/evidence-fields';
import { evidenceFieldsSpecSchema } from '@/validations/activity-type-spec';
import { parseLicencePositions } from '@/validations/licence-positions';
import {
  LICENCE_POSITIONS,
  REQUIRED_POSITIONS,
  groupOf,
  linkMatches,
  windowFor,
  type LicencePositionDef,
  type PositionRow,
} from './positions';

// ─── Input ───────────────────────────────────────────────────────────────────

/** One rating entry, selected straight off an Activity row */
export interface KharakterystykaActivity {
  year: number;
  status: ActivityStatus;
  evidence: unknown;
  activityType: {
    itemNumber: string;
    label: string;
    isActive: boolean;
    /** JSON — LicencePositionLink[] */
    licencePositions: unknown;
    /** JSON — EvidenceField[], for the evidence sentence */
    evidenceFields: unknown;
  };
}

/** The profile columns the document reads (only п.5 needs any) */
export interface KharakterystykaProfile {
  scientificDegree: ScientificDegree | null;
  degreeDefenceDate: Date | null;
}

// ─── Output ──────────────────────────────────────────────────────────────────

export interface PositionEntry {
  itemNumber: string;
  label: string;
  /** The generated sentence, without the year */
  summary: string;
  year: number;
}

export interface KharakterystykaPosition {
  number: number;
  title: string;
  fill: LicencePositionDef['fill'];
  met: boolean;
  /**
   * How far along the closest alternative is — «3 з 5». Null when the position
   * is not derived from the rating, or when it asks for a single entry and
   * «0 з 1» would say nothing «не виконано» does not.
   */
  progress: { have: number; need: number } | null;
  /** «Дані підтвердження показника», ready to print: entries separated by a blank line */
  evidence: string;
  /** The same entries, unjoined, for the on-screen list */
  entries: PositionEntry[];
  /** Why this one is not auto-filled, or what to watch out for */
  note?: string;
}

export interface Kharakterystyka {
  /** The five-year window, inclusive */
  from: number;
  to: number;
  positions: KharakterystykaPosition[];
  metCount: number;
  /**
   * Does this person count towards `Кнпп` in the ставка formula — ≥4 of 20?
   *
   * Note what this does NOT mean: somebody below the bar is not excluded from
   * the ставка distribution. `Кнпп` only sizes a divisor. Everybody still
   * receives a Vc and nobody falls below the floor, which is why staff who do
   * not meet the licence positions keep working normally.
   */
  qualifies: boolean;
}

// ─── Building ────────────────────────────────────────────────────────────────

/** Field specs off the row's JSON; a malformed row degrades to an empty summary */
function fieldsOf(activityType: { evidenceFields: unknown }): readonly EvidenceField[] {
  const parsed = evidenceFieldsSpecSchema.safeParse(activityType.evidenceFields);
  return parsed.success ? parsed.data : [];
}

function asEvidenceRecord(evidence: unknown): Record<string, unknown> {
  if (typeof evidence !== 'object' || evidence === null || Array.isArray(evidence)) return {};
  return evidence as Record<string, unknown>;
}

/** An entry that reached a position, kept with what the rule still needs to test */
interface Candidate extends PositionEntry {
  row: PositionRow;
  /**
   * Which input activity this came from.
   *
   * Deduplication keys on THIS and never on the text. Two real entries can
   * summarise identically — two «методичні рекомендації» of the same page count,
   * or two conference abstracts whose bibliography was pasted the same way — and
   * collapsing them would quietly cost the person a publication against a
   * threshold that counts to five.
   */
  source: number;
}

/**
 * Newest first, matching the printed document — 2025's publications come before
 * 2024's. Ties fall back to the item number then the text, so the order never
 * wobbles between loads of the same data.
 */
function byRecency(a: Candidate, b: Candidate): number {
  return (
    b.year - a.year ||
    a.itemNumber.localeCompare(b.itemNumber, 'uk') ||
    a.summary.localeCompare(b.summary, 'uk')
  );
}

/**
 * Only an APPROVED entry of a still-active indicator counts — the same rule the
 * score uses (`COUNTED` in lib/rating/recompute.ts). A discarded entry and a
 * deactivated indicator score nothing, and a document claiming a position that
 * the person's own rating does not pay for would be indefensible.
 */
function counts(activity: KharakterystykaActivity, from: number, to: number): boolean {
  return (
    activity.status === 'APPROVED' &&
    activity.activityType.isActive &&
    activity.year >= from &&
    activity.year <= to
  );
}

/**
 * Sorts every counting entry into the (position, group) buckets its indicator
 * names. One entry can land in several buckets — that is intended and is not
 * double counting: satisfying п.8 and п.10 at once is two different facts about
 * one project. What must never happen is the same entry landing twice in ONE
 * bucket, which `licencePositionProblems` refuses at the indicator level.
 */
function bucketEntries(
  activities: readonly KharakterystykaActivity[],
  from: number,
  to: number
): Map<string, Candidate[]> {
  const buckets = new Map<string, Candidate[]>();

  for (const [source, activity] of activities.entries()) {
    if (!counts(activity, from, to)) continue;

    const links = parseLicencePositions(activity.activityType.licencePositions);
    if (links.length === 0) continue;

    const evidence = asEvidenceRecord(activity.evidence);
    const fields = fieldsOf(activity.activityType);
    // Infinity, not the default 5: this text is the deliverable, and a dropped
    // field would understate what the person did to a licensing authority.
    const summary = summarizeEvidence(fields, evidence, Infinity);

    for (const link of links) {
      if (!linkMatches(link, evidence)) continue;
      const key = `${link.position}:${groupOf(link)}`;
      const candidate: Candidate = {
        itemNumber: activity.activityType.itemNumber,
        label: activity.activityType.label,
        summary,
        year: activity.year,
        row: { year: activity.year, evidence },
        source,
      };
      const bucket = buckets.get(key);
      if (bucket) bucket.push(candidate);
      else buckets.set(key, [candidate]);
    }
  }

  return buckets;
}

/** «Дані підтвердження показника» as the printed document has it */
function evidenceText(entries: readonly PositionEntry[]): string {
  return entries.map((e) => `${e.summary} (${e.year})`).join('\n\n');
}

function derivedPosition(
  def: LicencePositionDef,
  buckets: Map<string, Candidate[]>
): KharakterystykaPosition {
  let met = false;
  let best: { have: number; need: number } | null = null;
  const qualifying: Candidate[] = [];

  for (const alt of def.alternatives) {
    const bucket = buckets.get(`${def.number}:${alt.group}`) ?? [];
    // A rule-level condition the evidence can answer — only п.3 has one. Rows
    // that fail it are not evidence of this position and are not listed either:
    // a 40-page методичка does not belong under «підручник ≥ 5 авт. арк.».
    const passing = alt.rowTest ? bucket.filter((c) => alt.rowTest!(c.row)) : bucket;

    qualifying.push(...passing);
    if (passing.length >= alt.min) met = true;

    // «Closest» is the alternative with the largest share of its own bar, so a
    // person with 4 of 5 свідоцтва is shown as 4/5 rather than as 0/1 patents.
    if (!best || passing.length / alt.min > best.have / best.need) {
      best = { have: passing.length, need: alt.min };
    }
  }

  // One entry reaches a position twice only if its indicator names the same
  // (position, group) twice — refused by `licencePositionProblems`, deduped here
  // anyway so a hand-inserted row cannot print one citation as two. Keyed on the
  // entry itself, never on its text: see the note on `Candidate.source`.
  const seen = new Set<number>();
  const entries = qualifying
    .filter((c) => {
      if (seen.has(c.source)) return false;
      seen.add(c.source);
      return true;
    })
    .sort(byRecency)
    .map(({ itemNumber, label, summary, year }) => ({ itemNumber, label, summary, year }));

  // «0 з 1» tells the reader nothing that «не виконано» does not, and a met
  // single-entry position needs no counter either.
  const progress = best && best.need > 1 ? best : null;

  // A rule-level condition is invisible until it bites — «I have three
  // монографії, why is п.3 empty?» — so carry it into the note when unmet.
  const rowTestNote = def.alternatives.find((a) => a.rowTestNote)?.rowTestNote;
  const note = def.note ?? (!met ? rowTestNote : undefined);

  return {
    number: def.number,
    title: def.title,
    fill: def.fill,
    met,
    progress,
    evidence: evidenceText(entries),
    entries,
    ...(note ? { note } : {}),
  };
}

/**
 * п.5 — «Захист дисертації». One date on the profile, for the highest degree.
 * The position asks for a defence inside the five-year window, and the highest
 * degree is also the most recent, so one date answers it (decided 2026-08-07).
 */
function defencePosition(
  def: LicencePositionDef,
  profile: KharakterystykaProfile,
  from: number,
  to: number
): KharakterystykaPosition {
  const date = profile.degreeDefenceDate;
  // Read in UTC, matching how the column is written (`dateStr` in
  // validations/staff.ts parses the date input as UTC midnight). Using the
  // server's local calendar here would shift 1 January into the previous year
  // for any deployment west of UTC — and a year boundary is precisely what this
  // position turns on.
  const year = date?.getUTCFullYear();
  const met = year !== undefined && year >= from && year <= to;

  const entries: PositionEntry[] =
    date && year !== undefined
      ? [
          {
            itemNumber: '—',
            label: 'Захист дисертації',
            summary: date.toLocaleDateString('uk-UA', { timeZone: 'UTC' }),
            year,
          },
        ]
      : [];

  // A degree with no date is the common starting state for ~300 imported people,
  // and it is worth saying out loud: the position is unmet only because nobody
  // has filled the field in, which is a different problem from never defending.
  const note =
    !date && profile.scientificDegree
      ? 'Науковий ступінь є, але дату захисту не вказано в профілі'
      : def.note;

  return {
    number: def.number,
    title: def.title,
    fill: def.fill,
    met,
    progress: null,
    evidence: evidenceText(entries),
    entries,
    ...(note ? { note } : {}),
  };
}

/**
 * One person's Характеристика over the five years ending at `lastYear`.
 *
 * Pass every activity of theirs in that window; filtering to APPROVED rows of
 * active indicators happens here, so the caller's query does not have to encode
 * the scoring rules a second time.
 */
export function buildKharakterystyka(
  activities: readonly KharakterystykaActivity[],
  profile: KharakterystykaProfile,
  lastYear: number
): Kharakterystyka {
  const { from, to } = windowFor(lastYear);
  const buckets = bucketEntries(activities, from, to);

  const positions = LICENCE_POSITIONS.map((def) => {
    switch (def.fill) {
      case 'DERIVED':
        return derivedPosition(def, buckets);
      case 'PROFILE':
        return defencePosition(def, profile, from, to);
      // Typed by hand, or military and never applicable here. Both render as an
      // empty row carrying its reason — the document has twenty rows whatever
      // happens, because it is read against a twenty-item law.
      case 'MANUAL':
      case 'NOT_APPLICABLE':
        return {
          number: def.number,
          title: def.title,
          fill: def.fill,
          met: false,
          progress: null,
          evidence: '',
          entries: [],
          ...(def.note ? { note: def.note } : {}),
        } satisfies KharakterystykaPosition;
    }
  });

  const metCount = positions.filter((p) => p.met).length;

  return {
    from,
    to,
    positions,
    metCount,
    qualifies: metCount >= REQUIRED_POSITIONS,
  };
}
