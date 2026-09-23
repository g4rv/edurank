import { Check, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/aurora/ui/badge';
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

        <div className="flex flex-col items-start gap-2 sm:items-end">
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
            <Figure label="Заплановано" hundredths={plannedHundredths} />
            <Figure label="Виконано" hundredths={doneHundredths} />
            {targetHundredths === null ? null : (
              <p className="text-sm text-foreground-soft">
                ціль{' '}
                <span className="font-medium text-foreground tabular-nums">
                  {formatHours(targetHundredths)}
                </span>{' '}
                год
                {/* D37: once the plan is above the norm, the plan is what the
                    fact has to reach — say so, or «Виконано: бракує 200»
                    reads as a sum that does not add up. */}
                {target.doneTargetHundredths !== null &&
                  target.doneTargetHundredths > targetHundredths && (
                    <>
                      {' '}
                      · виконати{' '}
                      <span className="font-medium text-foreground tabular-nums">
                        {formatHours(target.doneTargetHundredths)}
                      </span>{' '}
                      год за планом
                    </>
                  )}
              </p>
            )}
          </div>

          {targetHundredths === null ? (
            <p className="text-sm text-foreground-soft">
              Ставку на цій кафедрі ще не визначено — ціль буде показано пізніше.
            </p>
          ) : (
            // Two states, and they are independent: somebody may have planned
            // enough and done little, which is the ordinary shape of October.
            <div className="flex flex-wrap gap-2 sm:justify-end">
              <State label="План" shortfallHundredths={target.shortfallHundredths} />
              <State label="Виконано" shortfallHundredths={target.doneShortfallHundredths} />
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function Figure({ label, hundredths }: { label: string; hundredths: number }) {
  return (
    <p className="text-2xl font-semibold tracking-[-0.01em] tabular-nums">
      <span className="mr-1.5 text-sm font-normal text-foreground-soft">{label}</span>
      {formatHours(hundredths)}
      <span className="ml-1 text-sm font-normal text-foreground-soft">год</span>
    </p>
  );
}

/** `--success` for met, `--warning` for short: §3's rule that a small badge
 *  reporting STATE may carry a hue, where a table row may not. */
function State({
  label,
  shortfallHundredths,
}: {
  label: string;
  shortfallHundredths: number | null;
}) {
  if (shortfallHundredths === null) return null;
  if (shortfallHundredths === 0) {
    return (
      <Badge tone="ok">
        <Check className="mr-1 size-3.5" />
        {label}: ціль виконано
      </Badge>
    );
  }
  return (
    <Badge tone="warn">
      <TriangleAlert className="mr-1 size-3.5" />
      {label}: бракує {formatHours(shortfallHundredths)} год
    </Badge>
  );
}
