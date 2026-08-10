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
    date: a.createdAt.toLocaleDateString('uk-UA'),
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
    rows.push({
      id: `empty-${indicator.id}`,
      itemNumber: indicator.itemNumber,
      label: indicator.label,
      summary: '',
      score: 0,
      status: 'APPROVED',
      statusLabel: '',
      removeReason: null,
      date: '',
      canDelete: false,
      isEmpty: true,
      inputSource: indicator.inputSource,
      division: indicator.verifyingDivision ? shortDivisionName(indicator.verifyingDivision) : null,
    });
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
