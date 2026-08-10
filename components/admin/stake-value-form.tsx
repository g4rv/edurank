'use client';

import { useActionState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { StakeActionState } from '@/app/(dashboard)/admin/stakes/actions';

type Action = (state: StakeActionState, formData: FormData) => Promise<StakeActionState>;

/**
 * One number, saved on its own.
 *
 * A row at a time rather than one form for the whole table, because these are
 * independent decisions: a typo in one кафедра's Кст must not block saving the
 * other fifteen, and «Кст мінімум 1,80 (18 осіб × 0,10)» belongs beside the
 * кафедра it is about, not in a list of errors at the top.
 *
 * The error goes inline under the field, per the project's feedback rule —
 * a toast is only for an outcome with no element to attach to.
 */
export function StakeValueForm({
  action,
  hidden,
  name,
  defaultValue,
  placeholder,
  suffix,
  ariaLabel,
  invalid,
}: {
  action: Action;
  /** Which row this is — departmentId/specialityId plus the year */
  hidden: Record<string, string | number>;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  /** «ставок», «осіб на ставку» — the unit, so the number is unambiguous */
  suffix?: string;
  ariaLabel: string;
  /** Already-saved value that no longer satisfies the rules */
  invalid?: boolean;
}) {
  const [state, formAction, isPending] = useActionState<StakeActionState, FormData>(action, null);
  const saved = useRef(false);

  useEffect(() => {
    if (state && 'success' in state) {
      // Saving is the one outcome with nothing to attach to — the field looks
      // identical before and after, so this is exactly what a toast is for.
      if (saved.current) toast.success('Збережено');
      saved.current = true;
    }
  }, [state]);

  const error = state && 'error' in state ? state.error : null;

  return (
    <form action={formAction} className="space-y-1">
      {Object.entries(hidden).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}

      <div className="flex items-center gap-2">
        <Input
          name={name}
          defaultValue={defaultValue}
          placeholder={placeholder}
          aria-label={ariaLabel}
          aria-invalid={!!error || invalid}
          disabled={isPending}
          inputMode="decimal"
          className={cn(
            'h-8 w-24 text-right tabular-nums',
            (error || invalid) && 'border-destructive'
          )}
        />
        {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
        <Button type="submit" size="sm" variant="ghost" disabled={isPending}>
          {isPending ? '…' : 'Зберегти'}
        </Button>
      </div>

      {error && <p className="max-w-md text-xs text-destructive">{error}</p>}
    </form>
  );
}
