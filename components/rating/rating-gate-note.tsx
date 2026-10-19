import { TriangleAlert } from 'lucide-react';
import { ratingGateDetail, type GatingType } from '@/lib/rating/rating-gate';

/**
 * The warning above Розділ 5 while 5.1 is empty (owner, 2026-10-19). It blocks
 * nothing — every section stays open and the total adds up — it says what the
 * close of the year will do without it. A status, so it carries the warning
 * tokens (§3 of docs/aurora.md), the same panel as `ExistingWorkPanel`'s.
 */
export function RatingGateNote({ missing }: { missing: GatingType[] }) {
  return (
    <div role="note" className="rounded-lg border bg-warning-surface px-4 py-3">
      <p className="text-warning-strong flex items-start gap-2 font-medium">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        {ratingGateDetail(missing)}
      </p>
    </div>
  );
}
