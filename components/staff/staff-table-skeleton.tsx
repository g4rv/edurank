import { Skeleton } from '@/components/ui/skeleton';

/**
 * The staff list's own shape while it loads.
 *
 * It has to match `StaffTable` column for column, or the page re-laysout the
 * moment the rows arrive — so the widths below are the same five the real table
 * declares in `COLUMNS`, written as flex bases rather than a `colgroup` because
 * there is no table here.
 *
 * Five columns, not six: the ADMIN-only «Роль» and «Ставка» pair is drawn, and
 * «Тип» is gone — it is a badge on the name now. A loading boundary cannot ask
 * who is looking, and drawing the wider version is the right guess: an EDITOR
 * sees two columns appear, an ADMIN sees nothing move.
 */
const ROW_WIDTHS = [
  ['w-44', 'w-44', 'w-40', 'w-24'],
  ['w-36', 'w-48', 'w-36', 'w-28'],
  ['w-48', 'w-40', 'w-44', 'w-20'],
  ['w-40', 'w-52', 'w-32', 'w-24'],
  ['w-52', 'w-44', 'w-40', 'w-28'],
  ['w-36', 'w-48', 'w-36', 'w-20'],
  ['w-44', 'w-40', 'w-44', 'w-24'],
  ['w-40', 'w-52', 'w-32', 'w-28'],
] as const;

/** Mirrors the column widths in `staff-table.tsx`; кафедра is the flexible one */
const CELL = ['w-96', 'w-84', 'flex-1', 'w-40', 'w-36', 'w-24'] as const;

export function StaffTableSkeleton() {
  return (
    <div className="flex max-h-fit min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card shadow-card">
      <div className="flex shrink-0 items-center gap-4 border-b px-4 py-3">
        <div className={CELL[0]}>
          <Skeleton className="h-4 w-16" />
        </div>
        <div className={CELL[1]}>
          <Skeleton className="h-4 w-20" />
        </div>
        <div className={CELL[2]}>
          <Skeleton className="h-4 w-32" />
        </div>
        <div className={CELL[3]}>
          <Skeleton className="h-4 w-24" />
        </div>
        <div className={CELL[4]}>
          <Skeleton className="h-4 w-14" />
        </div>
        <div className={CELL[5]}>
          <Skeleton className="h-4 w-12" />
        </div>
      </div>

      <div className="min-h-0 flex-auto divide-y overflow-hidden">
        {ROW_WIDTHS.map((cols, i) => (
          <div key={i} className="flex items-start gap-4 px-4 py-3">
            <div className={CELL[0]}>
              <Skeleton className={`h-4 ${cols[0]}`} />
            </div>
            <div className={CELL[1]}>
              <Skeleton className={`h-4 ${cols[1]}`} />
            </div>
            {/* Two lines: a кафедра and, sometimes, a сумісництво under it */}
            <div className={`${CELL[2]} space-y-1.5`}>
              <Skeleton className={`h-4 ${cols[2]}`} />
              <Skeleton className="h-3 w-24" />
            </div>
            <div className={`${CELL[3]} space-y-1.5`}>
              <Skeleton className={`h-4 ${cols[3]}`} />
              <Skeleton className="h-3 w-20" />
            </div>
            <div className={`${CELL[4]} flex justify-center`}>
              <Skeleton className="h-4 w-20" />
            </div>
            <div className={`${CELL[5]} flex justify-center`}>
              <Skeleton className="h-4 w-10" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
