import { TriangleAlert } from 'lucide-react';
import { Card } from '@/components/aurora/ui/card';
import { cn } from '@/lib/utils';
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
  locked,
}: {
  academicYear: string;
  orderRef: string | null;
  target: PlanTarget;
  /** The plan is saved — only then is there anything to have done. */
  locked: boolean;
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
        {/* No warning lines under the figures (owner, 2026-09-24): the figure
            itself says it. A number still short is red; the minimum carries a
            triangle while the plan is under it and disappears once it is met. */}
        <div>
          <dl className="space-y-1 text-sm">
            <Row
              label="Заплановано"
              hundredths={plannedHundredths}
              short={!!target.shortfallHundredths}
            >
              {targetHundredths !== null && target.shortfallHundredths ? (
                <span className="ml-1 text-warning">
                  (
                  <TriangleAlert
                    className="mr-1 mb-0.5 inline size-3.5"
                    aria-label="нижче мінімуму"
                  />
                  мін {formatHours(targetHundredths)})
                </span>
              ) : null}
            </Row>
            {/* D37: what is owed is the plan, or the norm when the plan is
                lower — red until the done hours reach it. */}
            {/* Only once the plan is saved (owner, 2026-09-24): nothing can be
                recorded before, so a «0 год» in red would only be noise. */}
            {locked && (
              <Row
                label="Виконано"
                hundredths={doneHundredths}
                short={!!target.doneShortfallHundredths}
              />
            )}
          </dl>

          {targetHundredths === null && (
            <p className="mt-2 text-xs text-foreground-soft">
              Ставку на цій кафедрі ще не визначено — мінімум буде показано пізніше.
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

function Row({
  label,
  hundredths,
  short = false,
  children,
}: {
  label: string;
  hundredths: number;
  /** Below what is owed — the figure turns red (§3: a value reporting STATE). */
  short?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt>{label}:</dt>
      <dd>
        <span className={cn('text-lg font-semibold tabular-nums', short && 'text-error')}>
          {formatHours(hundredths)}
        </span>{' '}
        год
        {children}
      </dd>
    </div>
  );
}
