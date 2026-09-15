import { Check, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/aurora/ui/badge';
import { Card } from '@/components/aurora/ui/card';
import type { PlanTarget } from '@/lib/science/target';

/**
 * «135 → 1,35» for an hour figure, the same shape `lib/stake/units.ts` uses for
 * a ставка — both are INTEGER HUNDREDTHS. Kept local rather than imported: a
 * ставка's formatter is named for ставки, and this is a plan's hour total.
 * Whole hours print without decimals — «500», not «500,00» — because that is
 * how Додаток III itself prints them and how almost every value here lands
 * (a FIXED item, a SELECT item), while a page-based item like an article can
 * genuinely land on «20,83».
 */
export function formatHours(hundredths: number): string {
  const value = hundredths / 100;
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace('.', ',');
}

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
