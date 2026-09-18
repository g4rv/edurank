import { Check, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/aurora/ui/badge';
import { Card } from '@/components/aurora/ui/card';
import type { PlanTarget } from '@/lib/science/target';
import { formatHours } from '@/lib/science/hours';

/**
 * The band an НПП checks their year against — **both** numbers, always.
 *
 * D29 puts план and факт in two tabs, and this is what makes switching between
 * them cost nothing: the comparison lives here, above both lists, so «did I
 * plan enough» and «have I done it» are answered without leaving either tab.
 *
 * The «no ставка» state is the common one in September (measured on dev
 * 2026-09-15: 306 of 328 НПП had no ставка allocated on any кафедра). No target
 * is guessed, the hours still add up, and nothing is ever blocked — the same
 * rule the ставки grid follows for overspending.
 */
export function PlanTotal({ target }: { target: PlanTarget }) {
  const { targetHundredths, plannedHundredths, doneHundredths } = target;

  if (targetHundredths === null) {
    return (
      <Card>
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <Figure label="Заплановано" hundredths={plannedHundredths} />
          <Figure label="Виконано" hundredths={doneHundredths} />
        </div>
        <p className="mt-2 text-sm text-foreground-soft">
          Ставку на цій кафедрі ще не визначено — ціль буде показано пізніше.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <Figure label="Заплановано" hundredths={plannedHundredths} />
        <Figure label="Виконано" hundredths={doneHundredths} />
        <p className="text-sm text-foreground-soft">
          ціль <span className="font-medium text-foreground">{formatHours(targetHundredths)}</span>{' '}
          год
        </p>
      </div>

      {/* Two states per line, and they are independent: somebody may have planned
          enough and done little, which is the ordinary shape of October. */}
      <div className="mt-2.5 flex flex-wrap gap-2">
        <State label="План" shortfallHundredths={target.shortfallHundredths} />
        <State label="Виконано" shortfallHundredths={target.doneShortfallHundredths} />
      </div>
    </Card>
  );
}

function Figure({ label, hundredths }: { label: string; hundredths: number }) {
  return (
    <p className="text-2xl font-semibold tracking-[-0.01em]">
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
