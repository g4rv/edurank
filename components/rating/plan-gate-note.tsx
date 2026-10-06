import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/aurora/ui/button';
import { EmptyState } from '@/components/aurora/ui/card';
import { PLAN_GATE_DETAIL, type PlanGateDepartment } from '@/lib/science/plan-gate';

/**
 * What a rating section shows until the science plan is saved (owner,
 * 2026-10-05) — in place of the list and the «Додати» form, with the way out
 * beside it.
 *
 * Names the кафедри only for a сумісник, who needs to know WHICH of two plans
 * is still a draft. Why a plan cannot be saved yet (no ставка) is the planning
 * screen's to say, where the disabled button sits.
 */
export function PlanGateNote({ unsaved }: { unsaved: PlanGateDepartment[] }) {
  return (
    <EmptyState
      action={
        <Button asChild>
          <Link href="/science-plan">
            Перейти до планування
            <ArrowRight />
          </Link>
        </Button>
      }
    >
      <p className="font-medium text-foreground">{PLAN_GATE_DETAIL}</p>
      {unsaved.length > 1 && (
        <p className="mx-auto mt-1.5 max-w-md">
          Ще не збережено: {unsaved.map((d) => d.name).join(', ')}.
        </p>
      )}
    </EmptyState>
  );
}
