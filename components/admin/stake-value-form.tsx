'use client';

import { useState, useTransition } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { StakeActionState } from '@/app/(dashboard)/admin/stakes/actions';

type Action = (state: StakeActionState, formData: FormData) => Promise<StakeActionState>;

/**
 * One number, saved when the field is left.
 *
 * A row at a time rather than one form for the whole table, because these are
 * independent decisions: a typo in one кафедра's Кст must not block saving the
 * other fifteen, and «Кст мінімум 1,80 (18 осіб × 0,10)» belongs beside the
 * кафедра it is about, not in a list of errors at the top.
 *
 * **On blur, with no Save button** (2026-08-12). Every other editable number on
 * these screens — the allocation, Мін, Макс, the sandbox pool — writes when the
 * field is left, and a lone «Зберегти» beside one of them taught that the
 * others might not be saving. The Enter key does the same thing, by blurring.
 *
 * Nothing is written when the value has not changed, so tabbing across a row of
 * норматив fields does not fire a save per column.
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
  className,
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
  className?: string;
}) {
  const stored = defaultValue ?? '';
  const [value, setValue] = useState(stored);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function commit() {
    // Unchanged, so there is nothing to write — but a refused value may have
    // left a message here, and typing the old number back is how somebody
    // undoes the mistake.
    if (value.trim() === stored.trim()) {
      setError(null);
      return;
    }

    startTransition(async () => {
      const form = new FormData();
      for (const [key, hiddenValue] of Object.entries(hidden)) {
        form.set(key, String(hiddenValue));
      }
      form.set(name, value);

      const result = await action(null, form);
      if (result && 'error' in result) {
        setError(result.error);
        setSaved(false);
      } else {
        setError(null);
        setSaved(true);
      }
    });
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          placeholder={placeholder}
          aria-label={ariaLabel}
          aria-invalid={!!error || invalid}
          disabled={pending}
          inputMode="decimal"
          className={cn(
            'h-8 w-24 text-right tabular-nums',
            // The hint has to read as a hint, not as a faded value — but NOT
            // in italic. The field is right-aligned, so the last glyph sits
            // flush against the padding and an italic slant shears it off:
            // «мін. 1,80» rendered as «мін. 1,8|». Colour alone does the job.
            'placeholder:text-muted-foreground/60',
            (error || invalid) && 'border-destructive',
            className
          )}
        />
        {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}

        {/* A silent autosave is indistinguishable from a lost edit, so the
            field says which it was. Nothing at all until something happens. */}
        <span className="text-xs text-muted-foreground">
          {pending ? (
            '…'
          ) : saved && !error ? (
            <span className="text-emerald-700 dark:text-emerald-400">Збережено</span>
          ) : null}
        </span>
      </div>

      {error && <p className="max-w-md text-xs text-destructive">{error}</p>}
    </div>
  );
}
