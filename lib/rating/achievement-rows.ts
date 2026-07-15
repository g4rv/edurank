import type { AchievementGroup, AchievementRow } from '@/components/rating/achievements-list';
import { SECTION_TITLES } from '@/lib/rating/activity-types';
import { ACTIVITY_STATUS_LABELS } from '@/lib/rating/labels';
import { activityTypeMeta, summarizeEvidence } from '@/lib/rating/registry';
import type { StaffActivity } from '@/lib/queries/list-activities';

function itemNumberFor(code: string): string {
  try {
    return activityTypeMeta(code).def.itemNumber;
  } catch {
    return '';
  }
}

function toRow(a: StaffActivity, canManage: boolean): AchievementRow {
  return {
    id: a.id,
    itemNumber: itemNumberFor(a.activityType.code),
    label: a.activityType.label,
    summary: summarizeEvidence(a.activityType.code, a.evidence),
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
    items: section.items.map((item) => ({
      ...item,
      removeReason: null,
      date: '',
      canDelete: false,
    })),
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

  const numbers = sections ?? [...rowsBySection.keys()].sort((a, b) => a - b);
  return numbers.map((number) => ({
    number,
    title: SECTION_TITLES[number] ?? '',
    items: rowsBySection.get(number) ?? [],
  }));
}
