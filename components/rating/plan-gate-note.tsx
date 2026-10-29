import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/aurora/ui/button';
import { EmptyState } from '@/components/aurora/ui/card';
import { PLAN_GATE_DETAIL, type UnsavedDepartment } from '@/lib/science/plan-gate';

/**
 * What a rating section shows until the science plan is saved (owner,
 * 2026-10-05) — in place of the list and the «Додати» form, with the way out
 * beside it.
 *
 * Names every кафедра still missing a plan, and says when the reason is a
 * missing ставка (owner, 2026-10-28). A сумісник with the main plan saved used
 * to read only «save your plan», follow the button to a tab that said «План
 * збережено», and never see that the second кафедра had not given them a
 * ставка — the one thing they cannot fix themselves.
 *
 * The button opens the tab of the кафедра to act on: the first one the person
 * can plan, otherwise the first one missing a ставка, where the planning
 * screen says the same.
 */
export function PlanGateNote({ unsaved }: { unsaved: UnsavedDepartment[] }) {
  const target = unsaved.find((d) => !d.noRate) ?? unsaved[0];
  return (
    <EmptyState
      action={
        <Button asChild>
          <Link href={target ? `/science-plan?dept=${target.id}` : '/science-plan'}>
            Перейти до планування
            <ArrowRight />
          </Link>
        </Button>
      }
    >
      <p className="font-medium text-foreground">{PLAN_GATE_DETAIL}</p>
      <ul className="mx-auto mt-1.5 max-w-md space-y-1">
        {unsaved.map((d) => (
          <li key={d.id}>
            {d.noRate ? (
              <>
                {d.name}: вам ще не розподілено ставку, тому план не можна зберегти. Зверніться до
                завідувача цієї кафедри.
              </>
            ) : (
              <>{d.name}: план ще не збережено.</>
            )}
          </li>
        ))}
      </ul>
    </EmptyState>
  );
}
