import type { AchievementGroup, AchievementRow } from '@/components/rating/achievements-list';
import { SECTION_TITLES } from '@/lib/rating/activity-types';
import { ACTIVITY_STATUS_LABELS } from '@/lib/rating/labels';
import { summarizeEvidence, type EvidenceField } from '@/lib/rating/evidence-fields';
import { evidenceFieldsSpecSchema } from '@/validations/activity-type-spec';
import type { StaffActivity } from '@/lib/queries/list-activities';

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
    date: a.createdAt.toLocaleDateString('uk-UA'),
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

/** Display groups from a closed year's frozen snapshot (authoritative after close) */
export function snapshotToGroups(snapshot: unknown): AchievementGroup[] | null {
  const s = snapshot as RatingSnapshot | null;
  if (!s || !Array.isArray(s.sections)) return null;
  return s.sections.map((section) => ({
    number: section.number,
    title: section.title,
    items: section.items
      .map((item) => ({
        ...item,
        // Read the status word from the current constant rather than the one
        // frozen into the snapshot: it is presentation, not data, so renaming it
        // should apply to already-closed years too.
        statusLabel: ACTIVITY_STATUS_LABELS[item.status] ?? item.statusLabel,
        removeReason: null,
        date: '',
        canDelete: false,
      }))
      .sort((a, b) => compareItemNumbers(a.itemNumber, b.itemNumber)),
  }));
}

/**
 * Maps activities to display groups; when `sections` is given, includes those (even empty) in order.
 * `canManage` = the viewer may delete their own open-year self-reports (drives the delete button).
 */
export function toAchievementGroups(
  activities: StaffActivity[],
  sections?: number[],
  canManage = false
): AchievementGroup[] {
  const rowsBySection = new Map<number, AchievementRow[]>();
  for (const a of activities) {
    const n = a.activityType.section.number;
    const rows = rowsBySection.get(n) ?? [];
    rows.push(toRow(a, canManage));
    rowsBySection.set(n, rows);
  }
  for (const rows of rowsBySection.values()) {
    rows.sort((a, b) => compareItemNumbers(a.itemNumber, b.itemNumber));
  }

  const numbers = sections ?? [...rowsBySection.keys()].sort((a, b) => a - b);
  return numbers.map((number) => ({
    number,
    title: SECTION_TITLES[number] ?? '',
    items: rowsBySection.get(number) ?? [],
  }));
}
