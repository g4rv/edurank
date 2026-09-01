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

/**
 * Evidence that is not a rating activity — a `KharakterystykaEntry` row.
 *
 * Two sources, one shape: п.15 and п.20 typed by hand, because no indicator
 * exists for either; and 2022–2024, carried in from the university's own files
 * for years the app never held a rating for.
 *
 * These do NOT weaken the rule at the top of this file. Nothing here is an
 * override or a second spelling of something already submitted: a position fed
 * by the rating still shows the rating's own sentences, and these are added
 * beside them. What cannot be edited is still what the generator produced.
 */
export interface KharakterystykaEntry {
  position: number;
  /**
   * Which alternative it satisfies, for positions with more than one — п.2 is
   * «patent» or «copyright». Null lands on the position's FIRST alternative,
   * which is the only defensible default: it is the one the law names first,
   * and for the nineteen positions with a single alternative it is the only one.
   */
  group: string | null;
  year: number;
  text: string;
  itemNumber: string | null;
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
    const summary = readable(summarizeEvidence(fields, evidence, Infinity));

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

/**
 * Legacy evidence, made readable for a printed document.
 *
 * The university's own files store several facts in one cell with no separator
 * at all — «Дисципліна:КиївщинознавствоПосилання:https://moodle…» is exactly how
 * the source has it, and it reaches us that way through both the 2025 rating
 * import and the 2022–2024 one. On screen it is unpleasant; in the document the
 * licence is read against, «...професійної освітиПосилання:...» looks like the
 * university cannot format a sentence.
 *
 * Only whitespace is touched. Not a word is added, removed or reordered — a
 * document that quietly rewrote its own evidence would be worth less than an
 * ugly one.
 */
function readable(summary: string): string {
  return (
    summary
      // «Дисципліна:Київщинознавство» → «Дисципліна: Київщинознавство».
      // A colon run straight into a letter is always a missing space. A URL is
      // untouched because its colon is followed by «/», and a time or a ratio
      // by a digit-then-colon, both excluded by the class.
      .replace(/:(?=[^\s/:])/g, ': ')
      // A second fact glued onto the end of the first — «…освітиПосилання: …».
      // Only where a lower-case letter runs straight into a capitalised word
      // that is followed by a colon, which is what a label looks like.
      .replace(/([а-яїієґa-z0-9)])([А-ЯЇІЄҐA-Z][а-яїієґa-z]+:)/g, '$1 · $2')
      .replace(/\s{2,}/g, ' ')
      .trim()
  );
}

/** «Дані підтвердження показника» as the printed document has it */
function evidenceText(entries: readonly PositionEntry[]): string {
  return entries.map((e) => `${e.summary} (${e.year})`).join('\n\n');
}

/**
 * The `KharakterystykaEntry` rows that belong to one alternative.
 *
 * A row naming no group lands on the position's FIRST alternative — see the
 * note on `KharakterystykaEntry.group`. `first` is passed rather than looked up
 * so this stays a pure filter.
 */
function entriesForAlternative(
  entries: readonly KharakterystykaEntry[],
  group: string,
  first: string
): KharakterystykaEntry[] {
  return entries.filter((e) => (e.group ?? first) === group);
}

/** A typed or imported row, rendered like an activity's for the printed list */
function entryAsPositionEntry(entry: KharakterystykaEntry): PositionEntry {
  return {
    itemNumber: entry.itemNumber ?? '—',
    label: 'Внесено вручну',
    summary: readable(entry.text),
    year: entry.year,
  };
}

function derivedPosition(
  def: LicencePositionDef,
  buckets: Map<string, Candidate[]>,
  manual: readonly KharakterystykaEntry[]
): KharakterystykaPosition {
  let met = false;
  let best: { have: number; need: number } | null = null;
  const qualifying: Candidate[] = [];
  const manualUsed: KharakterystykaEntry[] = [];
  const firstGroup = def.alternatives[0]?.group ?? '';

  for (const alt of def.alternatives) {
    const bucket = buckets.get(`${def.number}:${alt.group}`) ?? [];
    // A rule-level condition the evidence can answer — only п.3 has one. Rows
    // that fail it are not evidence of this position and are not listed either:
    // a 40-page методичка does not belong under «підручник ≥ 5 авт. арк.».
    const passing = alt.rowTest ? bucket.filter((c) => alt.rowTest!(c.row)) : bucket;

    // Typed and imported rows carry no structured evidence, so `rowTest` has
    // nothing to read on them and they are taken at their word — somebody
    // asserted this in writing, and the position's note still tells the reader
    // what the rule is. The alternative to trusting them is refusing every
    // pre-2025 монографія, which is worse and also wrong.
    const mine = entriesForAlternative(manual, alt.group, firstGroup);

    qualifying.push(...passing);
    manualUsed.push(...mine);
    // One row is one item, typed or imported alike, so a bar of five needs five
    // of them. A single row standing for five was checkable against nothing —
    // one реєстраційний номер cannot evidence five свідоцтв (owner, 2026-09-01).
    const have = passing.length + mine.length;
    if (have >= alt.min) met = true;

    // «Closest» is the alternative with the largest share of its own bar, so a
    // person with 4 of 5 свідоцтва is shown as 4/5 rather than as 0/1 patents.
    if (!best || have / alt.min > best.have / best.need) {
      best = { have, need: alt.min };
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

  // After the rating's own, newest first among themselves. A row appearing under
  // two alternatives of one position is listed once, for the same reason a
  // Candidate is: п.2 counts a свідоцтво towards one bar, not towards both.
  const manualSeen = new Set<KharakterystykaEntry>();
  for (const entry of manualUsed) {
    if (manualSeen.has(entry)) continue;
    manualSeen.add(entry);
  }
  entries.push(
    ...[...manualSeen]
      // Newest first, then the text — the same tie-break `byRecency` applies to
      // the rating's own rows, and for the same reason. The query has no
      // ORDER BY, so two rows of one year would otherwise print in whatever
      // order Postgres returned them, and the document would reorder itself
      // between loads of unchanged data.
      .sort((a, b) => b.year - a.year || a.text.localeCompare(b.text, 'uk'))
      .map(entryAsPositionEntry)
  );

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
  lastYear: number,
  manualEntries: readonly KharakterystykaEntry[] = []
): Kharakterystyka {
  const { from, to } = windowFor(lastYear);
  const buckets = bucketEntries(activities, from, to);

  // The same window as the activities, applied here rather than in the query,
  // for the same reason the status filter is: one place decides what counts.
  const inWindow = manualEntries.filter((e) => e.year >= from && e.year <= to);
  const manualFor = (position: number) => inWindow.filter((e) => e.position === position);

  const positions = LICENCE_POSITIONS.map((def) => {
    switch (def.fill) {
      case 'DERIVED':
        return derivedPosition(def, buckets, manualFor(def.number));
      case 'PROFILE':
        return defencePosition(def, profile, from, to);
      // Typed by hand — п.15 (школярі) and п.20 (практичний досвід). The rating
      // holds neither and never will: the catalogue moves only by a вчена рада
      // vote. Until `KharakterystykaEntry` existed these rendered as rows nobody
      // could fill, on a document the university is licensed against.
      case 'MANUAL': {
        const mine = manualFor(def.number);
        return {
          number: def.number,
          title: def.title,
          fill: def.fill,
          // Both positions ask for one thing, so any row meets them.
          met: mine.length >= 1,
          progress: null,
          evidence: evidenceText(mine.map(entryAsPositionEntry)),
          entries: mine.map(entryAsPositionEntry),
          ...(def.note ? { note: def.note } : {}),
        } satisfies KharakterystykaPosition;
      }
      // Military, and never applicable to this university — «для вищих
      // військових навчальних закладів». Deliberately NOT fillable: a row here
      // would be a claim the licence conditions do not permit us to make, so
      // there is nothing to read and nothing to type.
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
