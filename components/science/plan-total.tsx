import { Check, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/aurora/ui/badge';
import { Card } from '@/components/aurora/ui/card';
import type { PlanTarget } from '@/lib/science/target';
import { formatHours } from '@/lib/science/hours';

/**
 * «Заплановано N з M год» — the band an НПП checks their plan against.
 *
 * Three states, and the THIRD is the common one in September (measured on dev
 * 2026-09-15: 306 of 328 НПП have no ставка allocated on any кафедра yet). The
 * target is shown and never blocks a save — the same rule the ставки grid
 * follows for overspending.
 */
export function PlanTotal({ target }: { target: PlanTarget }) {
  const { targetHundredths, plannedHundredths, shortfallHundredths } = target;
  const planned = formatHours(plannedHundredths);

  if (targetHundredths === null) {
    return (
      <Card>
        <p className="text-2xl font-semibold tracking-[-0.01em]">Заплановано {planned} год</p>
        <p className="mt-1.5 text-sm text-foreground-soft">
          Ставку на цій кафедрі ще не визначено — ціль буде показано пізніше.
        </p>
      </Card>
    );
  }

  const met = shortfallHundredths === 0;

  return (
    <Card>
      <p className="text-2xl font-semibold tracking-[-0.01em]">
        Заплановано {planned} з {formatHours(targetHundredths)} год
      </p>
      <div className="mt-1.5">
        {met ? (
          <Badge tone="ok">
            <Check className="mr-1 size-3.5" />
            Ціль виконано
          </Badge>
        ) : (
          <Badge tone="warn">
            <TriangleAlert className="mr-1 size-3.5" />
            Бракує {formatHours(shortfallHundredths!)} год
          </Badge>
        )}
      </div>
    </Card>
  );
}
