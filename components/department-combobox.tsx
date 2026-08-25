'use client';

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox';
import { cn } from '@/lib/utils';

/** Stands for «every кафедра». Not `''` — that is «nothing chosen» to the primitive. */
const ALL = '__all__';

export interface DepartmentComboboxOption {
  id: string;
  name: string;
  /**
   * A short figure shown as a tag after the name — on /stakes the кафедра's
   * `Кст`, on /admin/invites how many people it holds. The факультет is NOT put
   * here: it repeats across every кафедра of one faculty and earns its width
   * poorly in a list this long.
   */
  tag?: string | null;
  /**
   * Amber when the tag reports something still to be done — «без Кст» is the
   * project's «pending / needs attention», the same hue as an unactivated
   * account. Grey otherwise.
   */
  tagTone?: 'muted' | 'warn';
}

/**
 * Pick a кафедра, by typing.
 *
 * **One component for all six places a кафедра is chosen** (owner, 2026-08-25).
 * Five of them were a plain `<Select>` — a scrolling list of thirty-one names,
 * where finding «Кафедра математики, інформатики і методики навчання» is a scan
 * rather than a choice. Only the staff form was searchable, and it was written
 * out by hand there; this is that behaviour, extracted, so the picker cannot be
 * good on one screen and poor on the other five.
 *
 * **Search matches the кафедра name only** (owner, 2026-08-24). Typing
 * «природнич» does not find Кафедра здоров'я through its факультет: every
 * кафедра name is unique, and three letters of the one you want beats reading a
 * факультет prefix on all thirty-one. The факультет is still shown — under the
 * field, by the caller — never searched.
 *
 * Presentational and controlled. Navigation belongs to the caller:
 * `DepartmentSelect` wraps this for the screens where the choice is a URL param,
 * and a form passes a react-hook-form `field`.
 */
export function DepartmentCombobox({
  departments,
  value,
  onChange,
  allowAll,
  placeholder = '—',
  emptyText = 'Кафедру не знайдено',
  clearable = false,
  disabled = false,
  className,
}: {
  departments: readonly DepartmentComboboxOption[];
  /** `''` means nothing chosen — or «всі кафедри» when `allowAll` is set */
  value: string;
  onChange: (next: string) => void;
  /**
   * Adds a row that clears the choice instead of setting one.
   *
   * Off by default: /stakes and /my-department/students act on exactly one
   * кафедра, and «усі» there is a screen nobody makes a decision from. A filter
   * is the opposite — «всі» is the state it opens in.
   */
  allowAll?: { label: string };
  placeholder?: string;
  emptyText?: string;
  /** Offer a × back to «nothing». On a required field that is an invalid state. */
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const items: DepartmentComboboxOption[] = allowAll
    ? [{ id: ALL, name: allowAll.label }, ...departments]
    : [...departments];

  const selected = departments.find((d) => d.id === value);
  const displayValue = selected?.name ?? (value === '' && allowAll ? allowAll.label : '');

  return (
    <Combobox
      items={items}
      value={value === '' && allowAll ? ALL : value}
      onChange={(next) => onChange(next === ALL ? '' : next)}
      // Name only — see the note above. The «всі» row is never filtered out by
      // its own label, because searching for a кафедра and being shown «всі» is
      // noise; it simply fails the test like any other non-match.
      filter={(dept: DepartmentComboboxOption, search) =>
        dept.name.toLowerCase().includes(search.toLowerCase())
      }
      displayValue={displayValue}
      disabled={disabled}
    >
      <ComboboxInput placeholder={placeholder} clearable={clearable} className={className} />
      <ComboboxContent>
        <ComboboxEmpty>{emptyText}</ComboboxEmpty>
        <ComboboxList<DepartmentComboboxOption>>
          {(dept) => (
            <ComboboxItem key={dept.id} value={dept.id}>
              <span className="truncate">{dept.name}</span>
              {dept.tag && (
                <span
                  className={cn(
                    'ml-auto shrink-0 rounded px-1.5 py-px text-xs tabular-nums',
                    dept.tagTone === 'warn'
                      ? 'bg-amber-500/10 text-amber-700 dark:text-amber-500'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {dept.tag}
                </span>
              )}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
