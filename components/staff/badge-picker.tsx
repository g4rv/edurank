'use client';

import { X } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/aurora/ui/select';

/**
 * «Add badge» — pick from a list and it becomes a badge; ✕ takes it off
 * (owner, 2026-10-06). For почесні звання and адміністративні посади, where a
 * person may hold several.
 *
 * The chips are `SpecialityDepartmentsCell`'s, in the brand tint a `Badge`
 * wears for a classification. The select below them only ever offers what is
 * not picked yet, and is remounted after every pick (`key`) so it returns to
 * its placeholder instead of showing the last choice as if it were a value.
 */
export function BadgePicker({
  id,
  options,
  value,
  onChange,
  disabled = false,
  addLabel = 'Додати…',
}: {
  id?: string;
  options: readonly { value: string; label: string }[];
  value: readonly string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  addLabel?: string;
}) {
  const labelOf = (v: string) => options.find((o) => o.value === v)?.label ?? v;
  const available = options.filter((o) => !value.includes(o.value));

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 rounded-full bg-brand/10 py-0.5 pr-1.5 pl-2.5 text-xs font-medium text-brand-strong"
            >
              {labelOf(v)}
              <button
                type="button"
                aria-label={`Прибрати «${labelOf(v)}»`}
                disabled={disabled}
                onClick={() => onChange(value.filter((x) => x !== v))}
                className="rounded-full p-0.5 transition-colors hover:bg-brand/15 hover:text-error-strong disabled:opacity-50"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {available.length > 0 && (
        <Select
          key={value.join('|')}
          onValueChange={(v) => onChange([...value, v])}
          disabled={disabled}
        >
          <SelectTrigger id={id} className="w-full">
            <SelectValue placeholder={addLabel} />
          </SelectTrigger>
          <SelectContent>
            {available.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
