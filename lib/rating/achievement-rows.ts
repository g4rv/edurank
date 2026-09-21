import type { AchievementGroup, AchievementRow } from '@/components/rating/achievements-list';
import { SECTION_TITLES, shortDivisionName } from '@/lib/rating/activity-types';
import { ACTIVITY_STATUS_LABELS } from '@/lib/rating/labels';
import { summarizeEvidence, type EvidenceField } from '@/lib/rating/evidence-fields';
import { evidenceFieldsSpecSchema } from '@/validations/activity-type-spec';
import type { StaffActivity } from '@/lib/queries/list-activities';
import type { TemplateIndicator } from '@/lib/queries/list-template-indicators';

/** Field specs off the row's JSON; a malformed row degrades to an empty summary */
function fieldsOf(activityType: { evidenceFields: unknown }): readonly EvidenceField[] {
  const parsed = evidenceFieldsSpecSchema.safeParse(activityType.evidenceFields);
  return parsed.success ? parsed.data : [];
}

/** Numeric-aware compare for item numbers: "1.9" < "1.10" < "3.24"; unknown ("") sorts last */
export function compareItemNumbers(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  const [aMajor = 0, aMinor = 0] = a.split('.').map(Number);
  const [bMajor = 0, bMinor = 0] = b.split('.').map(Number);
  return aMajor - bMajor || aMinor - bMinor;
}

function toRow(a: StaffActivity, canManage: boolean): AchievementRow {
  return {
    id: a.id,
    itemNumber: a.activityType.itemNumber,
    label: a.activityType.label,
    summary: summarizeEvidence(fieldsOf(a.activityType), a.evidence),
    score: a.score,
    status: a.status,
    statusLabel: ACTIVITY_STATUS_LABELS[a.status],
    removeReason: a.removeReason,
    inputSource: a.activityType.inputSource,
    division: a.activityType.verifyingDivision
      ? shortDivisionName(a.activityType.verifyingDivision)
      : null,
    // NPP may delete only their own self-report, and only while the year is open
    canDelete: canManage && a.submittedByRole === 'NPP' && a.status === 'APPROVED',
  };
}

// Shape written by closeYear into RatingEntry.snapshot
interface RatingSnapshot {
  closedAt: string;
  total: number;
  sections: {
    number: number;
    title: string;
    subtotal: number;
    items: {
      id: string;
      itemNumber: string;
      label: string;
      summary: string;
      score: number;
      status: 'APPROVED';
      statusLabel: string;
    }[];
  }[];
}

/**
 * One indicator nobody has anything under: a row that scores 0 rather than a
 * gap in the list. `isEmpty` is what the «Показувати незаповнені» switch hides.
 */
function emptyRow(indicator: TemplateIndicator): AchievementRow {
  return {
    id: `empty-${indicator.id}`,
    itemNumber: indicator.itemNumber,
    label: indicator.label,
    summary: '',
    score: 0,
    status: 'APPROVED',
    statusLabel: '',
    removeReason: null,
    canDelete: false,
    isEmpty: true,
    inputSource: indicator.inputSource,
    division: indicator.verifyingDivision ? shortDivisionName(indicator.verifyingDivision) : null,
  };
}

/**
 * Display groups from a closed year's frozen snapshot (authoritative after close).
 *
 * **The catalogue fills its gaps too** (owner, 2026-09-21). A closed year used
 * to render the snapshot alone, so 2025 listed the eleven indicators the person
 * scored under and nothing else — «Показувати незаповнені (0)», and a Розділ 2
 * that said «Немає досягнень» without saying what it was missing. The table's
 * whole reason for listing empty rows is that two people reading one rating
 * must see one table, and that argument does not stop when the year closes.
 *
 * The frozen figures are untouched: an empty row scores 0 and no subtotal is
 * recomputed. What is added is the NAME of an indicator that was there to be
 * filled, which is exactly what somebody comparing 2025 against 2026 is after.
 *
 * Matched on `itemNumber` — the number the наказ prints and the one thing a
 * snapshot item and a catalogue row are sure to share; a snapshot carries no
 * `ActivityType` id. Label is the fallback for an indicator with no number.
 */
export function snapshotToGroups(
  snapshot: unknown,
  catalogue?: readonly TemplateIndicator[]
): AchievementGroup[] | null {
  const s = snapshot as RatingSnapshot | null;
  if (!s || !Array.isArray(s.sections)) return null;

  const groups = new Map<number, AchievementGroup>(
    s.sections.map((section) => [
      section.number,
      {
        number: section.number,
        title: section.title,
        items: section.items.map((item) => ({
          ...item,
          // Read the status word from the current constant rather than the one
          // frozen into the snapshot: it is presentation, not data, so renaming
          // it should apply to already-closed years too.
          statusLabel: ACTIVITY_STATUS_LABELS[item.status] ?? item.statusLabel,
          removeReason: null,
          canDelete: false,
        })),
      },
    ])
  );

  const filled = new Set<string>();
  for (const group of groups.values()) {
    for (const item of group.items) filled.add(item.itemNumber || item.label);
  }

  for (const indicator of catalogue ?? []) {
    if (filled.has(indicator.itemNumber || indicator.label)) continue;
    const number = indicator.section.number;
    let group = groups.get(number);
    if (!group) {
      // A section the snapshot never wrote — every indicator in it is empty.
      group = { number, title: indicator.section.title, items: [] };
      groups.set(number, group);
    }
    group.items.push(emptyRow(indicator));
  }

  return [...groups.values()]
    .sort((a, b) => a.number - b.number)
    .map((group) => ({
      ...group,
      items: [...group.items].sort((a, b) => compareItemNumbers(a.itemNumber, b.itemNumber)),
    }));
}

/**
 * Maps activities to display groups; when `sections` is given, includes those (even empty) in order.
 * `canManage` = the viewer may delete their own open-year self-reports (drives the delete button).
 *
 * Headings come from the year's own RatingSection rows, which every activity
 * already carries — the SECTION_TITLES constant is only the fallback for a
 * section with nothing in it, since an empty group brings no title with it.
 */
export function toAchievementGroups(
  activities: StaffActivity[],
  sections?: number[],
  canManage = false,
  catalogue?: readonly TemplateIndicator[]
): AchievementGroup[] {
  const rowsBySection = new Map<number, AchievementRow[]>();
  const titleBySection = new Map<number, string>();
  const filled = new Set<string>();

  for (const a of activities) {
    const n = a.activityType.section.number;
    const rows = rowsBySection.get(n) ?? [];
    rows.push(toRow(a, canManage));
    rowsBySection.set(n, rows);
    titleBySection.set(n, a.activityType.section.title);
    filled.add(a.activityType.id);
  }

  // Indicators with nothing under them, so the table shows the whole rating
  // rather than only the parts already done. An НПП reading the old table had
  // to know the catalogue by heart to notice what was missing.
  for (const indicator of catalogue ?? []) {
    if (filled.has(indicator.id)) continue;
    const n = indicator.section.number;
    const rows = rowsBySection.get(n) ?? [];
    rows.push(emptyRow(indicator));
    rowsBySection.set(n, rows);
    titleBySection.set(n, indicator.section.title);
  }

  for (const rows of rowsBySection.values()) {
    rows.sort((a, b) => compareItemNumbers(a.itemNumber, b.itemNumber));
  }

  const numbers = sections ?? [...rowsBySection.keys()].sort((a, b) => a - b);
  return numbers.map((number) => ({
    number,
    title: titleBySection.get(number) ?? SECTION_TITLES[number] ?? '',
    items: rowsBySection.get(number) ?? [],
  }));
}
