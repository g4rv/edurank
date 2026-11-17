import { REQUIRED_POSITIONS } from '@/lib/kharakterystyka/positions';
import type { DepartmentKnpp } from '@/lib/queries/get-department-knpp';
import { UK } from '@/lib/plural';
import { Card } from '@/components/aurora/ui/card';

/**
 * The кафедра's two head counts, side by side — because they are different
 * numbers and the whole feature goes wrong when somebody treats them as one.
 *
 *   Кнпп       the divisor in the formula — only those clearing ≥4 of 20
 *   НПП всього the roster, сумісники included
 *
 * The pool minimum (Кст ≥ 0,1 × N) is no longer shown here (owner, 2026-11-16:
 * «not useful» on a licence panel); `/stakes` still checks and shows it.
 */
export function KnppSummary({ data, year }: { data: DepartmentKnpp; year: number }) {
  // Against the кафедра's OWN staff: `headcount` now includes сумісники, who
  // are not in `knpp` by design, so subtracting from it would report every one
  // of them as failing the licence positions.
  const belowBar = data.primaryHeadcount - data.knpp;

  return (
    // Аврора's `Card`, with §4's card title — it was a bare bordered box with
    // its own muted micro-title, the one card on the кафедра pages that did
    // not match the ones around it.
    <Card className="shrink-0">
      <h2 className="mb-3 text-sm font-semibold tracking-wide uppercase">
        Ліцензійні показники — {year}
      </h2>

      <div className="flex flex-wrap gap-x-8 gap-y-3">
        <Figure
          value={data.knpp}
          label="Відповідають ліцензійним умовам"
          hint={`НПП із ${REQUIRED_POSITIONS}+ позиціями з 20 — це дільник Кнпп у формулі ставок`}
        />
        <Figure
          value={data.headcount}
          label="НПП усього"
          hint="на кафедрі разом із сумісниками, крім архівних"
        />
      </div>

      {belowBar > 0 && (
        // Not a warning. Кнпп only sizes a divisor: everybody still receives a
        // ставка, and saying so here stops the number reading as a shortlist.
        <p className="mt-3 border-t pt-3 text-sm text-foreground">
          {belowBar} {belowBar === 1 ? 'працівник не досягає' : 'працівників не досягають'}{' '}
          {REQUIRED_POSITIONS} позицій. Це впливає лише на дільник Кнпп — ставку отримують усі.
        </p>
      )}

      {data.partTimeHeadcount > 0 && (
        <p className="mt-3 border-t pt-3 text-sm text-foreground">
          Із них {UK.partTimer(data.partTimeHeadcount)} з інших кафедр. Вони не входять у Кнпп —
          ліцензійні позиції рахує основна кафедра.
        </p>
      )}
    </Card>
  );
}

function Figure({ value, label, hint }: { value: number | string; label: string; hint: string }) {
  return (
    <div>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-sm font-medium">{label}</p>
      <p className="mt-0.5 text-sm text-foreground">{hint}</p>
    </div>
  );
}
