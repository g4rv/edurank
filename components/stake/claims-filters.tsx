'use client';

import { Search } from 'lucide-react';
import { Input } from '@/components/aurora/ui/input';
import { Switch } from '@/components/aurora/ui/switch';
import { cn } from '@/lib/utils';

/**
 * «Залучені здобувачі» — the filter band in the header card.
 *
 * **These narrow what is already on the client; the кафедра picker does not.**
 * Choosing a кафедра changes which claims the SERVER fetches, so it stays a URL
 * param like every other server filter in the app. A student's name and a
 * claimant's name are a substring match over rows already in memory — a few
 * hundred at most — so they are `useState` and answer on the keystroke. Putting
 * them in the URL would round-trip the server to filter an array it already
 * sent, and would fight the sort, which is client state for the same reason.
 *
 * That is why the кафедра control arrives as a `ReactNode` rather than being
 * built here: it belongs to the page, and this component would otherwise need
 * the router to drive one control out of four.
 */
export function ClaimsFilters({
  search,
  onSearch,
  contestedOnly,
  onContestedOnly,
  hasContested,
  departmentSelect,
}: {
  /** Matches the здобувач OR the НПП — see the note on the box below */
  search: string;
  onSearch: (v: string) => void;
  contestedOnly: boolean;
  onContestedOnly: (v: boolean) => void;
  /** Disables the switch when nothing is contested — a filter that could only empty the table */
  hasContested: boolean;
  /** The кафедра picker, built by the page because it drives the URL */
  departmentSelect?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* **One box over both names** (owner, 2026-09-21), like `/staff`, which
          searches ПІБ, email and ORCID from a single field.

          It was built as two — one for the здобувач, one for the НПП — on the
          argument that «знайти Молчанову» and «показати все, що подала Басюк»
          are different questions and a combined box would mix their matches.
          That is true and it does not matter: a здобувач and an НПП sharing a
          surname is rare, and when it happens the extra row is visibly in a
          different column. What two boxes DID cost was a decision before every
          keystroke — which one do I type in — and the width of a second field
          in a bar that also holds a кафедра picker. */}
      <SearchBox
        value={search}
        onChange={onSearch}
        placeholder="Пошук за здобувачем або НПП"
        label="Пошук за іменем здобувача або НПП"
      />

      {/* Wrapped, because it is rendered on the SERVER and handed across as a
          prop. React counts a bare server-rendered node among this component's
          list children and warns about a missing key; one element of its own
          settles that, and it is where the width belongs anyway.

          **`flex-1`, not a fixed width** (owner, 2026-09-21: «why department
          select is so slim, no department can be fully readable»). It was
          `w-56` — 224px against кафедра names that run past fifty characters,
          so every one of them truncated and the control showed «Кафедра
          соціальної педагогі…» whatever you picked. `/staff` had already
          settled this: it puts its кафедра picker on a row of its own because
          «its value is a sentence». Here there is one long control rather than
          two, so it takes what the search box's `max-w` does not — about 570px
          on a 1366px window, which fits the longest кафедра we have.

          `min-w-72` is where it stops and the row wraps instead of squeezing
          the search beside it into nothing. */}
      {departmentSelect && <div className="min-w-72 flex-1">{departmentSelect}</div>}

      {/* A switch, like «Сумісник» on /staff, and for the same reason: it is one
          condition that is either on or off, and it has no menu to size to.
          No count on the label: the strip under this row already says
          «Спірних: N» for the ones still PENDING, while this filter reaches
          every duplicate whatever its status. Two different numbers under one
          word is worse than no number at all. */}
      <label
        className={cn(
          'flex shrink-0 items-center gap-2',
          hasContested ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
        )}
      >
        <Switch
          checked={contestedOnly}
          onCheckedChange={onContestedOnly}
          disabled={!hasContested}
        />
        <span
          className={cn('text-sm', contestedOnly ? 'text-foreground' : 'text-muted-foreground')}
        >
          Лише спірні
        </span>
      </label>
    </div>
  );
}

/**
 * `min-w-0 flex-1` with a `max-w`, matching `/staff`: fixed widths made the row
 * overflow the card by the exact amount the search boxes refused to give back,
 * and the last control dropped to a line of its own.
 *
 * No `h-*` and no `text-sm` — both come from the field surface, and a `text-sm`
 * here would undo the `text-base md:text-sm` that stops iOS zooming a focused
 * field.
 */
function SearchBox({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <div className="relative max-w-88 min-w-40 flex-1">
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="pl-9"
      />
    </div>
  );
}
