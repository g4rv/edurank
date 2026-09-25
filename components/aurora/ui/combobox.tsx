'use client';

import * as React from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/aurora/ui/popover';
import { cn } from '@/lib/utils';
import { fieldSurface } from './field-surface';
import {
  listEmpty,
  listPanel,
  listRow,
  listRowCheck,
  listRowSelected,
  listScroll,
} from './listbox';

/**
 * «Аврора»'s combobox — a drop-in replacement for `components/ui/combobox`.
 *
 * Copied whole, like the select: the root, the input, the list and the item all
 * share a context, so importing half from here and half from `ui/` would break
 * at runtime rather than at compile time.
 *
 * Only surfaces change. The filtering, the controlled/uncontrolled value
 * handling and the clear button all behave exactly as before.
 *
 * The text field was `h-9 rounded-md` while every other control in the app is
 * `h-8 rounded-lg` — it predates the rest and never got aligned. It takes the
 * shared field surface now, so a combobox and a select sitting in the same form
 * are finally the same height.
 */

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
  /** The field the list hangs off — see the guard in `ComboboxContent`. */
  anchorRef: React.RefObject<HTMLDivElement | null>;
  /**
   * The rendered `<ul>`. Keyboard navigation walks its `[role="option"]`
   * children rather than the `filteredItems` array, because only the consumer's
   * render callback knows what VALUE each item carries — DOM order is render
   * order, and reading it needs no registry for items to sign into.
   */
  listRef: React.RefObject<HTMLUListElement | null>;
  /** Unique per instance. It was the literal «combobox-listbox», so two
   *  comboboxes on one screen shared a DOM id and `aria-controls` pointed at
   *  whichever rendered first. */
  listboxId: string;
};

/** A stable DOM id for one option, so `aria-activedescendant` can name the
 *  highlighted row — the only way a screen reader follows a list the focus
 *  never moves into. */
function optionId(listboxId: string, value: string): string {
  return `${listboxId}-opt-${value.replace(/[^\w-]/g, '_')}`;
}

const ComboboxContext = React.createContext<ComboboxCtx | null>(null);

function useCombobox() {
  const ctx = React.useContext(ComboboxContext);
  if (!ctx) throw new Error('useCombobox must be inside <Combobox>');
  return ctx;
}

/**
 * Which row wears `data-highlighted` — the select's own roving state,
 * reproduced here (owner, 2026-09-18). Radix starts a select's highlight on
 * whichever row is already chosen, so opening either control shows the same
 * tint; this list has no Radix roving focus underneath it, so nothing ever set
 * that state and the combobox opened with only a checkmark.
 *
 * **Its own context, read only by the input and the rows** (2026-09-24). It
 * changes on every row the pointer crosses — and a list scrolled under a still
 * mouse crosses one per wheel step. Kept in the one shared context, each step
 * rebuilt that object and woke everything reading it, the Radix popover
 * included, which then committed a second time: ~70 ms of script per wheel
 * step on a 6×-throttled CPU, felt as a stutter on an ordinary laptop.
 */
type HighlightCtx = { highlighted: string; setHighlighted: (v: string) => void };

const HighlightContext = React.createContext<HighlightCtx | null>(null);

function useHighlight() {
  const ctx = React.useContext(HighlightContext);
  if (!ctx) throw new Error('useHighlight must be inside <Combobox>');
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
  const [highlighted, setHighlighted] = React.useState('');

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

  // Read through refs so `setOpen` and `select` keep ONE identity for the life
  // of the control. `setOpen` is the popover's `onOpenChange`: a new function
  // on each render changed the Radix popover's own context, and every part of
  // it re-rendered with it.
  const valueRef = React.useRef(value);
  const onChangeRef = React.useRef(onChange);
  React.useLayoutEffect(() => {
    valueRef.current = value;
    onChangeRef.current = onChange;
  });

  const setOpen = React.useCallback((v: boolean) => {
    setOpenRaw(v);
    if (v) {
      setHighlighted(valueRef.current);
    } else {
      setSearch('');
    }
  }, []);

  const select = React.useCallback(
    (v: string) => {
      onChangeRef.current?.(v);
      setOpen(false);
    },
    [setOpen]
  );

  const anchorRef = React.useRef<HTMLDivElement | null>(null);
  const listRef = React.useRef<HTMLUListElement | null>(null);
  const listboxId = React.useId();

  const ctx = React.useMemo<ComboboxCtx>(
    () => ({
      open,
      setOpen,
      search,
      setSearch,
      value,
      select,
      displayValue,
      filteredItems,
      disabled,
      anchorRef,
      listRef,
      listboxId,
    }),
    [open, setOpen, search, value, select, displayValue, filteredItems, disabled, listboxId]
  );
  const highlight = React.useMemo(() => ({ highlighted, setHighlighted }), [highlighted]);

  return (
    <ComboboxContext.Provider value={ctx}>
      <HighlightContext.Provider value={highlight}>
        <Popover open={open} onOpenChange={setOpen}>
          {children}
        </Popover>
      </HighlightContext.Provider>
    </ComboboxContext.Provider>
  );
}

// ─── ComboboxInput ────────────────────────────────────────────────────────────

interface ComboboxInputProps {
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /**
   * The field's accessible name. **It was silently dropped** — callers passed
   * `aria-label` and the component never read it, so a combobox with a
   * placeholder like «—» announced as just «combobox» (found 2026-09-25).
   */
  'aria-label'?: string;
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
  'aria-label': ariaLabel,
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
    anchorRef,
    listRef,
    listboxId,
  } = useCombobox();
  const { highlighted, setHighlighted } = useHighlight();
  const isDisabled = disabledProp ?? ctxDisabled;

  /** Every option currently on screen, in the order it is drawn. */
  function options(): HTMLElement[] {
    return Array.from(listRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? []);
  }

  function moveHighlight(step: 1 | -1 | 'first' | 'last') {
    const rows = options();
    if (rows.length === 0) return;

    const current = rows.findIndex((row) => row.dataset.value === highlighted);
    let next: number;
    if (step === 'first') next = 0;
    else if (step === 'last') next = rows.length - 1;
    // Nothing highlighted yet (a fresh open, or a search that dropped the
    // highlighted row): ArrowDown starts at the top, ArrowUp at the bottom.
    else if (current === -1) next = step === 1 ? 0 : rows.length - 1;
    // Wraps, like every listbox people already use.
    else next = (current + step + rows.length) % rows.length;

    const row = rows[next];
    setHighlighted(row.dataset.value ?? '');
    // `nearest`, not `center`: a list that jumps a whole page under one
    // arrow press loses the reader's place.
    row.scrollIntoView({ block: 'nearest' });
  }

  /**
   * **The control had no keyboard at all** (found 2026-09-20). Items were
   * chosen on `onMouseDown` and nothing listened for a key, so the вид роботи
   * picker on every science dialog could not be operated without a mouse:
   * ArrowDown did nothing and Enter did nothing.
   *
   * Focus deliberately stays in the input — that is what a combobox is — so
   * the highlighted row is announced through `aria-activedescendant` rather
   * than by moving focus into the list.
   */
  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (isDisabled) return;

    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault();
        if (!open) {
          setOpen(true);
          return;
        }
        moveHighlight(event.key === 'ArrowDown' ? 1 : -1);
        return;
      }
      case 'Home':
      case 'End': {
        if (!open) return;
        event.preventDefault();
        moveHighlight(event.key === 'Home' ? 'first' : 'last');
        return;
      }
      case 'Enter': {
        // Only when the list is open with a row under the highlight. Otherwise
        // Enter belongs to the form around it — swallowing it would stop a
        // one-field dialog being submitted from the keyboard.
        if (!open || !highlighted) return;
        event.preventDefault();
        select(highlighted);
        return;
      }
      case 'Escape': {
        if (!open) return;
        event.preventDefault();
        setOpen(false);
        return;
      }
      case 'Tab': {
        // Leaving the field abandons the list; it must not stay open over the
        // control that now has focus.
        if (open) setOpen(false);
      }
    }
  }

  const shownValue = open ? search : value ? displayValue || value : '';
  const showClear = clearable && !!value && !isDisabled;

  return (
    <PopoverAnchor asChild>
      <div ref={anchorRef} className={cn('relative', className)}>
        <input
          type="text"
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={open && highlighted ? optionId(listboxId, highlighted) : undefined}
          onKeyDown={onKeyDown}
          disabled={isDisabled}
          placeholder={value ? undefined : placeholder}
          value={shownValue}
          onChange={(e) => {
            setSearch(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          // **Nothing here overrides `fieldSurface` any more** (owner,
          // 2026-09-10). Two stock shadcn lines survived the Аврора conversion
          // and sat AFTER the shared surface in this same `cn`, so they won:
          //
          //   `disabled:opacity-50`  — §7 forbids it outright. The disabled
          //     fill in `.aurora-field` was being applied correctly and then
          //     faded to half strength, so a closed combobox came out LIGHTER
          //     than the five disabled selects beside it on the claim form, and
          //     its placeholder went faint with it. `tel-input` and
          //     `orcid-input` each carry a comment about being moved off the
          //     same class; this one was missed.
          //   `focus-visible:ring-1 ring-ring` — a neutral 1px ring where every
          //     other control gets the brand's 3px. §7: the focus ring is the
          //     one moment the interface confirms it is listening.
          //
          // `disabled:cursor-not-allowed` and `outline-none` were dropped with
          // them because `fieldSurface` already sets both — they were duplicates,
          // not decisions.
          className={cn(
            fieldSurface('default'),
            'flex',
            // 8px of inset plus each 16px glyph plus the 4px between them.
            showClear ? 'pr-12' : 'pr-8'
          )}
        />
        {/* Both glyphs in ONE centred row, matching `DateInput`.

            They were placed separately, each with its own `top-*` and `right-*`
            — so the distance between them was a subtraction done by hand, and
            `top-2.5` is 10px against the 8px that actually centres a 16px icon
            in an `h-8` field. Both sat two pixels low. `inset-y-0` +
            `items-center` centres them against whatever the field is, and `gap`
            sets the distance once.

            The row ignores the pointer so it cannot cover the input under it;
            the × takes it back for itself. */}
        <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center gap-1">
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
              // `p-1 -m-1` — a 24px hit target around a 16px glyph, with the
              // negative margin taking the padding back out of the layout, so
              // both icons stay the same size and the same distance apart.
              className="pointer-events-auto -m-1 rounded-sm p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
            >
              <X className="size-4" />
            </button>
          )}
          <ChevronDown
            className={cn(
              'size-4 text-muted-foreground transition-transform duration-150',
              open && 'rotate-180'
            )}
          />
        </div>
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
  const { anchorRef } = useCombobox();

  /**
   * The overlay this field sits in, if any — the panel is portalled there
   * instead of to `body`.
   *
   * A dialog, a sheet and an alert dialog each lock scrolling with
   * `react-remove-scroll`, which lets the wheel through only inside the
   * element it locked. A panel portalled to `body` sits outside it, so the
   * list showed a scrollbar and ignored the wheel completely.
   *
   * Read from the DOM rather than from a context, because the control must not
   * have to know which overlay it was dropped into — and resolved in an effect
   * because `anchorRef` is empty on the first render.
   */
  const [container, setContainer] = React.useState<Element | null>(null);
  React.useEffect(() => {
    setContainer(
      anchorRef.current?.closest(
        '[data-slot="dialog-content"], [data-slot="sheet-content"], [data-slot="alert-dialog-content"]'
      ) ?? null
    );
  }, [anchorRef]);

  /**
   * **The field itself is never «outside» the list.**
   *
   * The list opens on FOCUS and hangs off a `PopoverAnchor`, not a
   * `PopoverTrigger` — and Radix only exempts a trigger from its dismiss
   * layer. So the one press that focuses the field opened the list, and the
   * click completing that same press was read as an interaction outside it,
   * closing it; the click handler then reopened it. Shows, hides while the
   * button is held, shows on release.
   *
   * It only bit inside a dialog, where a second dismiss layer is stacked over
   * the popover's: measured 2026-09-17 with the same component rendered on a
   * page (one clean open) and in a dialog (open, close, open).
   *
   * Guards all three, because the dismiss arrives as a pointerdown on some
   * paths and as a focus change on others.
   */
  const fromAnchor = (event: { target: EventTarget | null; preventDefault: () => void }) => {
    if (anchorRef.current?.contains(event.target as Node)) event.preventDefault();
  };

  return (
    // `--radix-popover-trigger-width`, NOT `…-anchor-width` (2026-08-18). The
    // latter does not exist — Popover re-namespaces popper's anchor width under
    // «trigger», and the undefined variable left the width unset, so the list
    // collapsed to the width of the longest name instead of matching the field.
    <PopoverContent
      container={container}
      align="start"
      // **Below the field, always.** The shared `PopoverContent` defaults to
      // `side="top"`, chosen for the CALENDAR — the popover's usual content
      // here, tall and triggered from a field low on a form. A list of options
      // is not that: it belongs under the input you are typing into, which is
      // where every select in the app opens, and §8 says the select and the
      // combobox are one control. Inheriting the calendar's preference put the
      // вид роботи list above the field and, since this portals to `body` and
      // nothing clips it, straight over the dialog it belongs to (owner,
      // 2026-09-20). Radix still flips it when there is genuinely no room
      // below, so this is a preference rather than a promise.
      side="bottom"
      // Keeps the panel off the window edge. Without it the available height
      // Radix reports runs to the very bottom of the viewport, so on a short
      // window the list ended up flush against it (and a rounding pixel past
      // it). Eight is the same breathing room the shell gives everything else.
      collisionPadding={8}
      className={cn(
        listPanel,
        'w-(--radix-popover-trigger-width) overflow-hidden',
        // **Two leftovers from the popover underneath** (measured 2026-09-17).
        // This list sits on `components/ui/popover`, which brings its own
        // `shadow-md ring-1 ring-foreground/10` and, being a flex column for
        // the prose panels it was built for, a `gap-2.5`. `listPanel`'s own
        // `p-0` and radius win because tailwind-merge knows those groups;
        // `shadow-float` and `shadow-md` it does not pair up, so both applied
        // — and the gap it never had a reason to touch.
        //
        // §8 says the select and the combobox are one control. Measured side
        // by side their ROWS already are, to the pixel; this is the panel
        // catching up.
        'gap-0 shadow-float ring-0',
        className
      )}
      onOpenAutoFocus={(e) => e.preventDefault()}
      onPointerDownOutside={fromAnchor}
      onFocusOutside={fromAnchor}
      onInteractOutside={fromAnchor}
    >
      {children}
    </PopoverContent>
  );
}

// ─── ComboboxEmpty ────────────────────────────────────────────────────────────

function ComboboxEmpty({ children }: { children: React.ReactNode }) {
  const { filteredItems } = useCombobox();
  if (filteredItems.length > 0) return null;
  return <div className={listEmpty}>{children}</div>;
}

// ─── ComboboxList ─────────────────────────────────────────────────────────────

interface ComboboxListProps<T> {
  children: (item: T) => React.ReactNode;
  className?: string;
}

function ComboboxList<T>({ children, className }: ComboboxListProps<T>) {
  const { filteredItems, listRef, listboxId } = useCombobox();

  // **Opens on the chosen row, centred** (owner, 2026-09-24). The list mounts
  // fresh on every open, so it started at the top and a choice from the middle
  // of 18 пункти was out of sight. Set on `scrollTop`, not `scrollIntoView`,
  // which would also scroll the dialog and the page around it.
  //
  // It keeps re-centring until the person touches the list, because the
  // layout is not final when the list mounts (measured 2026-09-24): the panel
  // first renders at the WINDOW's width — 1226px, where no row wraps — and is
  // narrowed to the field's width later, when the long пункти wrap to two or
  // three lines and push the chosen row down by tens of pixels. A one-off
  // centring, or one bounded by a timer, landed low on a slow machine. So
  // every row is observed as well as the list: a row that grows moves the
  // chosen one without the list itself changing size. `offsetTop` (the `<ul>`
  // is the offset parent — `relative` below) also ignores the opening
  // `zoom-in-95`, which `getBoundingClientRect` would measure mid-scale.
  React.useLayoutEffect(() => {
    const list = listRef.current;
    const row = list?.querySelector<HTMLElement>('[role="option"][aria-selected="true"]');
    if (!list || !row) return;
    const centre = () => {
      list.scrollTop = row.offsetTop - (list.clientHeight - row.offsetHeight) / 2;
    };
    centre();
    const resize = new ResizeObserver(centre);
    resize.observe(list);
    list.querySelectorAll('[role="option"]').forEach((option) => resize.observe(option));
    // The person has taken over — scrolling, touching, pointing or typing.
    const stop = () => resize.disconnect();
    const events = ['wheel', 'touchstart', 'pointerdown'] as const;
    events.forEach((name) => list.addEventListener(name, stop, { once: true, passive: true }));
    document.addEventListener('keydown', stop, { once: true, capture: true });
    return () => {
      stop();
      events.forEach((name) => list.removeEventListener(name, stop));
      document.removeEventListener('keydown', stop, { capture: true });
    };
    // On mount only: re-centring as the person types would fight their search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (filteredItems.length === 0) return null;
  return (
    <ul
      ref={listRef}
      id={listboxId}
      role="listbox"
      // No vertical padding. With `py-1` a single option left a 4px white
      // sliver above and below the hover highlight, which reads as a rendering
      // fault rather than as breathing room. The panel clips its own corners
      // instead — see `ComboboxContent`.
      className={cn(listScroll, 'relative', className)}
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
  const { value, select, listboxId } = useCombobox();
  const { highlighted, setHighlighted } = useHighlight();
  const isSelected = value === itemValue;
  const isHighlighted = highlighted === itemValue;

  return (
    <li
      id={optionId(listboxId, itemValue)}
      role="option"
      aria-selected={isSelected}
      // What the arrow keys read to know which row this is — the DOM is the
      // registry (see `listRef` on the context).
      data-value={itemValue}
      // Same attribute `listRow` already styles for the select
      // (`data-highlighted:bg-brand/10 …`) — see the context field above.
      data-highlighted={isHighlighted ? '' : undefined}
      className={cn(listRow, isSelected && listRowSelected, className)}
      onMouseEnter={() => setHighlighted(itemValue)}
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
      {isSelected && <Check className={listRowCheck} />}
    </li>
  );
}

export { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList };
