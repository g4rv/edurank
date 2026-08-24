'use client';

import * as React from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

// ─── Context ─────────────────────────────────────────────────────────────────

type ComboboxCtx = {
  open: boolean;
  setOpen: (v: boolean) => void;
  search: string;
  setSearch: (v: string) => void;
  value: string;
  select: (v: string) => void;
  displayValue: string;
  filteredItems: unknown[];
  disabled: boolean;
};

const ComboboxContext = React.createContext<ComboboxCtx | null>(null);

function useCombobox() {
  const ctx = React.useContext(ComboboxContext);
  if (!ctx) throw new Error('useCombobox must be inside <Combobox>');
  return ctx;
}

// ─── Combobox root ────────────────────────────────────────────────────────────

interface ComboboxProps<T> {
  items: readonly T[];
  value?: string;
  onChange?: (value: string) => void;
  filter?: (item: T, search: string) => boolean;
  displayValue?: string;
  disabled?: boolean;
  children: React.ReactNode;
}

function Combobox<T>({
  items,
  value = '',
  onChange,
  filter,
  displayValue = '',
  disabled = false,
  children,
}: ComboboxProps<T>) {
  const [open, setOpenRaw] = React.useState(false);
  const [search, setSearch] = React.useState('');

  const defaultFilter = (item: T, s: string) =>
    String(item).toLowerCase().includes(s.toLowerCase());

  const filteredItems: unknown[] = React.useMemo(
    () =>
      search
        ? (items as T[]).filter((item) => (filter ?? defaultFilter)(item, search))
        : [...items],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, search, filter]
  );

  function setOpen(v: boolean) {
    setOpenRaw(v);
    if (!v) setSearch('');
  }

  function select(v: string) {
    onChange?.(v);
    setOpen(false);
  }

  return (
    <ComboboxContext.Provider
      value={{
        open,
        setOpen,
        search,
        setSearch,
        value,
        select,
        displayValue,
        filteredItems,
        disabled,
      }}
    >
      <Popover open={open} onOpenChange={setOpen}>
        {children}
      </Popover>
    </ComboboxContext.Provider>
  );
}

// ─── ComboboxInput ────────────────────────────────────────────────────────────

interface ComboboxInputProps {
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /**
   * Offer a × to unset the value (2026-08-24).
   *
   * The primitive had no way back to «nothing» once a value was picked:
   * emptying the text box only edits the search, which is discarded on close.
   * That was invisible while every field using it was one where a value is
   * required, and it bit the moment a field replaced a `<Select>` whose «—»
   * row people relied on.
   *
   * Opt-in, because on a required field a clear button is an offer to create
   * an invalid state.
   */
  clearable?: boolean;
}

function ComboboxInput({
  placeholder = '—',
  disabled: disabledProp,
  className,
  clearable = false,
}: ComboboxInputProps) {
  const {
    open,
    setOpen,
    search,
    setSearch,
    displayValue,
    value,
    select,
    disabled: ctxDisabled,
  } = useCombobox();
  const isDisabled = disabledProp ?? ctxDisabled;

  const shownValue = open ? search : value ? displayValue || value : '';
  const showClear = clearable && !!value && !isDisabled;

  return (
    <PopoverAnchor asChild>
      <div className={cn('relative', className)}>
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls="combobox-listbox"
          disabled={isDisabled}
          placeholder={value ? undefined : placeholder}
          value={shownValue}
          onChange={(e) => {
            setSearch(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          className={cn(
            'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs',
            showClear ? 'pr-14' : 'pr-8',
            'focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none',
            'disabled:cursor-not-allowed disabled:opacity-50'
          )}
        />
        {showClear && (
          <button
            type="button"
            aria-label="Очистити"
            // `onMouseDown` with preventDefault, like ComboboxItem: a plain
            // click fires after the input's focus handler has already reopened
            // the popover, so the field cleared and then flew open again.
            onMouseDown={(e) => {
              e.preventDefault();
              select('');
            }}
            className="absolute top-2 right-8 rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
          >
            <X className="size-4" />
          </button>
        )}
        <ChevronDown
          className={cn(
            'pointer-events-none absolute top-2.5 right-2.5 size-4 text-muted-foreground transition-transform duration-150',
            open && 'rotate-180'
          )}
        />
      </div>
    </PopoverAnchor>
  );
}

// ─── ComboboxContent ──────────────────────────────────────────────────────────

function ComboboxContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    // `--radix-popover-trigger-width`, NOT `…-anchor-width` (2026-08-18). The
    // latter does not exist — Popover re-namespaces popper's anchor width under
    // «trigger», and the undefined variable left the width unset, so the list
    // collapsed to the width of the longest name instead of matching the field.
    <PopoverContent
      align="start"
      className={cn('w-(--radix-popover-trigger-width) p-0', className)}
      onOpenAutoFocus={(e) => e.preventDefault()}
    >
      {children}
    </PopoverContent>
  );
}

// ─── ComboboxEmpty ────────────────────────────────────────────────────────────

function ComboboxEmpty({ children }: { children: React.ReactNode }) {
  const { filteredItems } = useCombobox();
  if (filteredItems.length > 0) return null;
  return <div className="py-6 text-center text-sm text-muted-foreground">{children}</div>;
}

// ─── ComboboxList ─────────────────────────────────────────────────────────────

interface ComboboxListProps<T> {
  children: (item: T) => React.ReactNode;
  className?: string;
}

function ComboboxList<T>({ children, className }: ComboboxListProps<T>) {
  const { filteredItems } = useCombobox();
  if (filteredItems.length === 0) return null;
  return (
    <ul
      id="combobox-listbox"
      role="listbox"
      className={cn('max-h-60 overflow-y-auto py-1', className)}
    >
      {(filteredItems as T[]).map(children)}
    </ul>
  );
}

// ─── ComboboxItem ─────────────────────────────────────────────────────────────

interface ComboboxItemProps {
  value: string;
  children: React.ReactNode;
  className?: string;
}

function ComboboxItem({ value: itemValue, children, className }: ComboboxItemProps) {
  const { value, select } = useCombobox();
  const isSelected = value === itemValue;

  return (
    <li
      role="option"
      aria-selected={isSelected}
      className={cn(
        'flex cursor-pointer items-center gap-2 px-3 py-2 text-sm select-none',
        'hover:bg-muted/60',
        isSelected && 'bg-muted/40 font-medium',
        className
      )}
      onMouseDown={(e) => {
        e.preventDefault();
        select(itemValue);
      }}
    >
      {/* On the RIGHT, and only when it applies (2026-08-18). It used to sit
          before the name at `opacity-0`, holding its space on every row — which
          reads as an unexplained indent rather than as a reserved slot. `ml-auto`
          means showing it moves nothing, so there is no jump on select either. */}
      {children}
      {isSelected && <Check className="ml-auto size-4 shrink-0" />}
    </li>
  );
}

export { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList };
