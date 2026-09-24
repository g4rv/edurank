import { Check, TriangleAlert } from 'lucide-react';
import { Card } from '@/components/aurora/ui/card';
import { formatHours } from '@/lib/science/hours';
import type { PlanTarget } from '@/lib/science/target';

/**
 * The band an НПП checks their year against, folded INTO the page header.
 *
 * It used to be a card of its own under a bare `<h1>` sitting on the wash, so
 * the screen opened with four stacked blocks before its content: a title, a
 * figures band, a row of tabs with a sentence floating beside them, and only
 * then the list. Every other rebuilt screen opens with ONE header card that
 * carries the name on the left and the numbers and actions on the right —
 * `/profile`, `/achievements/[section]` — and this now matches them.
 *
 * Both figures, always. D29 puts план and факт in two tabs, and this is what
 * makes switching between them cost nothing: the comparison lives above both
 * lists, so «did I plan enough» and «have I done it» are answered without
 * leaving either tab.
 *
 * The «no ставка» state is the common one in September (measured on dev
 * 2026-09-15: 306 of 328 НПП had no ставка allocated on any кафедра). No
 * target is guessed, the hours still add up, and nothing is ever blocked — the
 * same rule the ставки grid follows for overspending.
 */
export function PlanHeader({
  academicYear,
  orderRef,
  target,
}: {
  academicYear: string;
  orderRef: string | null;
  target: PlanTarget;
}) {
  const { targetHundredths, plannedHundredths, doneHundredths } = target;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-[-0.01em]">Наукова робота</h1>
          <p className="mt-0.5 text-sm text-foreground-soft">
            {academicYear} навчальний рік
            {orderRef && ` · наказ ${orderRef}`}
          </p>
        </div>

        {/* The figures straight in the header, as the other rebuilt headers
            carry theirs on the right (owner, 2026-09-24) — they were a
            sentence of four numbers and two pills, and nothing on it said at a
            glance how far along somebody is. */}
        <div>
          <dl className="space-y-1 text-sm">
            <Row label="Заплановано" hundredths={plannedHundredths}>
              {targetHundredths !== null && (
                <span className="text-foreground-soft"> (мін {formatHours(targetHundredths)})</span>
              )}
            </Row>
            <Row label="Виконано" hundredths={doneHundredths} />
          </dl>

          <div className="mt-2 space-y-0.5 text-xs">
            {targetHundredths === null ? (
              <p className="text-foreground-soft">
                Ставку на цій кафедрі ще не визначено — мінімум буде показано пізніше.
              </p>
            ) : (
              // Two states, and they are independent: somebody may have planned
              // enough and done little, which is the ordinary shape of October.
              // D37: once the plan is above the norm, the plan is what the fact
              // has to reach, so «не вистачає» counts from the larger of the two.
              <>
                {target.shortfallHundredths !== null && target.shortfallHundredths > 0 && (
                  <Short>
                    до мінімуму в плані не вистачає {formatHours(target.shortfallHundredths)} год
                  </Short>
                )}
                {target.doneShortfallHundredths === 0 ? (
                  <p className="flex items-center gap-1 font-medium text-success">
                    <Check className="size-3.5" />
                    План виконано
                  </p>
                ) : (
                  target.doneShortfallHundredths !== null && (
                    <Short>не вистачає: {formatHours(target.doneShortfallHundredths)} год</Short>
                  )
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function Row({
  label,
  hundredths,
  children,
}: {
  label: string;
  hundredths: number;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt>{label}:</dt>
      <dd>
        <span className="text-lg font-semibold tabular-nums">{formatHours(hundredths)}</span> год
        {children}
      </dd>
    </div>
  );
}

/** `--warning` text: §3's rule that a small indicator reporting STATE may
 *  carry a hue. */
function Short({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-1 font-medium text-warning">
      <TriangleAlert className="size-3.5" />
      {children}
    </p>
  );
}
