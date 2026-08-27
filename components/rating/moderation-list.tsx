'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ChevronUp, ChevronDown, ChevronsUpDown, Eye, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { Pagination } from '@/components/ui/pagination';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DiscardActivityButton } from '@/components/rating/discard-activity-button';
import { VerifyActivityButton } from '@/components/rating/verify-activity-button';
import { SubmissionPanel } from '@/components/rating/submission-panel';
import { compareItemNumbers } from '@/lib/rating/achievement-rows';
import { sumScores } from '@/lib/round';
import { DepartmentCombobox } from '@/components/department-combobox';
import { UK } from '@/lib/plural';

export interface ModerationRow {
  id: string;
  /** Full — used for search, sorting, the discard dialog and the cell's tooltip */
  staffName: string;
  /** «Прізвище І. П.» — what the table column shows, so it fits on one line */
  staffShortName: string;
  department: string;
  faculty: string;
  section: number;
  itemNumber: string;
  label: string;
  summary: string;
  score: number;
  status: 'PENDING' | 'APPROVED' | 'REMOVED';
  statusLabel: string;
  removeReason: string | null;
  /** Display form; shown in the panel, no longer a column */
  date: string;
  canDiscard: boolean;
  verified: boolean;
  canVerify: boolean;
}

const STATUS_STYLES: Record<ModerationRow['status'], string> = {
  APPROVED: 'bg-primary/10 text-primary',
  PENDING: 'bg-muted text-muted-foreground',
  REMOVED: 'bg-destructive/10 text-destructive',
};

const SECTIONS = [1, 2, 3, 4, 5];
const PAGE_ROWS = 50;
const PAGE_PEOPLE = 20;

type SortKey = 'name' | 'department' | 'section' | 'item' | 'score';
type StatusFilter = 'all' | 'approved' | 'removed' | 'unverified';

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Усі статуси' },
  { value: 'approved', label: 'Зараховані' },
  { value: 'removed', label: 'Відхилені' },
  { value: 'unverified', label: 'Публікації без перевірки' },
];

// A `?sort=date` link from before the Дата column was removed falls back to
// «name» rather than breaking, because the parse checks membership here.
const SORT_KEYS: readonly SortKey[] = ['name', 'department', 'section', 'item', 'score'];

export function ModerationList({ rows }: { rows: ModerationRow[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Every control reads from the query string, so a narrowed view can be
  // bookmarked or sent to a colleague — the same contract /staff already has.
  // Defaults stay out of the URL to keep a shared link readable.
  const sectionParam = Number(searchParams.get('section'));
  const section = SECTIONS.includes(sectionParam) ? sectionParam : null;
  const search = searchParams.get('q') ?? '';
  const statusParam = searchParams.get('status') ?? '';
  const status: StatusFilter = STATUS_OPTIONS.some((o) => o.value === statusParam)
    ? (statusParam as StatusFilter)
    : 'all';
  const faculty = searchParams.get('faculty') ?? 'all';
  const department = searchParams.get('dept') ?? 'all';
  // Selected by itemNumber — unique inside one year's template
  const indicator = searchParams.get('item') ?? 'all';
  const grouped = searchParams.get('view') === 'grouped';
  const sortParam = searchParams.get('sort') ?? '';
  // Kept as two primitives, not an object: an object literal would be a new
  // reference every render and would defeat the memo on `filtered`.
  const sortKey: SortKey = (SORT_KEYS as readonly string[]).includes(sortParam)
    ? (sortParam as SortKey)
    : 'name';
  const sortDir: 'asc' | 'desc' = searchParams.get('dir') === 'desc' ? 'desc' : 'asc';
  const pageParam = Number(searchParams.get('page'));
  const page = Number.isFinite(pageParam) && pageParam > 1 ? Math.trunc(pageParam) : 1;

  // A falsy value drops the key, so the default state leaves no trace in the URL.
  function setParams(overrides: Record<string, string | undefined>) {
    const sp = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(overrides)) {
      if (value) sp.set(key, value);
      else sp.delete(key);
    }
    // Narrowing the list invalidates the page number, so it resets unless the
    // change *is* a page change.
    if (!('page' in overrides)) sp.delete('page');
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  // The input stays local so typing is instant; the URL catches up on a pause.
  const [searchDraft, setSearchDraft] = useState(search);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleSearch(value: string) {
    setSearchDraft(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      // Cleared before the push so the sync below can tell our own navigation
      // from an outside one
      debounceRef.current = null;
      setParams({ q: value || undefined });
    }, 400);
  }

  // A queued push must not outlive the page: typing and then leaving would
  // otherwise navigate back here 400ms later, from a component nobody is on.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Back/forward changes the query string without passing through handleSearch,
  // so the box would keep the old text while the list showed the new results.
  // Skipped while a push is queued — that value is the reader still typing, and
  // it is newer than anything the URL currently holds.
  useEffect(() => {
    if (debounceRef.current === null) setSearchDraft(search);
  }, [search]);

  const faculties = useMemo(() => uniqueSorted(rows.map((r) => r.faculty)), [rows]);

  // Each list is scoped by the filter above it, so the options can never be empty
  const departments = useMemo(() => {
    const scope = faculty === 'all' ? rows : rows.filter((r) => r.faculty === faculty);
    return uniqueSorted(scope.map((r) => r.department));
  }, [rows, faculty]);

  const indicators = useMemo(() => {
    const scope = section === null ? rows : rows.filter((r) => r.section === section);
    const byNumber = new Map<string, string>();
    for (const r of scope) if (!byNumber.has(r.itemNumber)) byNumber.set(r.itemNumber, r.label);
    return Array.from(byNumber, ([itemNumber, label]) => ({ itemNumber, label })).sort((a, b) =>
      compareItemNumbers(a.itemNumber, b.itemNumber)
    );
  }, [rows, section]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = rows.filter(
      (r) =>
        (section === null || r.section === section) &&
        (!q || r.staffName.toLowerCase().includes(q)) &&
        (faculty === 'all' || r.faculty === faculty) &&
        (department === 'all' || r.department === department) &&
        (indicator === 'all' || r.itemNumber === indicator) &&
        matchStatus(r, status)
    );

    const sign = sortDir === 'asc' ? 1 : -1;
    const compare = (a: ModerationRow, b: ModerationRow): number => {
      switch (sortKey) {
        case 'name':
          return a.staffName.localeCompare(b.staffName, 'uk');
        case 'department':
          return a.department.localeCompare(b.department, 'uk');
        case 'section':
          return a.section - b.section;
        case 'item':
          return compareItemNumbers(a.itemNumber, b.itemNumber);
        case 'score':
          return a.score - b.score;
      }
    };
    return [...list].sort((a, b) => {
      const cmp = compare(a, b);
      if (cmp !== 0) return sign * cmp;
      // Ties always read in the same order — person, then catalogue item number —
      // so one НПП's submissions never come back in raw insertion order.
      return (
        a.staffName.localeCompare(b.staffName, 'uk') ||
        compareItemNumbers(a.itemNumber, b.itemNumber)
      );
    });
  }, [rows, section, search, faculty, department, indicator, status, sortKey, sortDir]);

  // Narrowing a parent filter can strand its child on a value that no longer
  // exists, so the child clears in the same navigation.
  function changeFaculty(value: string) {
    setParams({ faculty: value === 'all' ? undefined : value, dept: undefined });
  }

  function changeSection(value: number | null) {
    setParams({ section: value ? String(value) : undefined, item: undefined });
  }

  function onPage(next: number) {
    setParams({ page: next > 1 ? String(next) : undefined });
  }

  function toggleSort(key: SortKey) {
    const dir = sortKey === key && sortDir === 'asc' ? 'desc' : 'asc';
    setParams({
      sort: key === 'name' && dir === 'asc' ? undefined : key,
      dir: dir === 'desc' ? 'desc' : undefined,
    });
  }

  return (
    // Fills the main area so the pager stays on screen with the table — the
    // rows scroll inside the card, not the page.
    <div className="flex h-full min-h-0 flex-col gap-4">
      <Filters
        search={searchDraft}
        setSearch={handleSearch}
        section={section}
        setSection={changeSection}
        status={status}
        setStatus={(v) => setParams({ status: v === 'all' ? undefined : v })}
        faculty={faculty}
        setFaculty={changeFaculty}
        faculties={faculties}
        department={department}
        setDepartment={(v) => setParams({ dept: v === 'all' ? undefined : v })}
        departments={departments}
        indicator={indicator}
        setIndicator={(v) => setParams({ item: v === 'all' ? undefined : v })}
        indicators={indicators}
        grouped={grouped}
        setGrouped={(v) => setParams({ view: v ? 'grouped' : undefined })}
      />

      <p className="text-sm text-muted-foreground">
        Знайдено {UK.submission(filtered.length)}
        {faculty !== 'all' && ` · ${faculty}`}
        {department !== 'all' && ` · ${department}`}
        {indicator !== 'all' && ` · п. ${indicator}`}
      </p>

      {filtered.length === 0 ? (
        <div className="rounded-xl border bg-card px-6 py-10 text-center text-sm text-muted-foreground">
          Подань не знайдено.
        </div>
      ) : grouped ? (
        <GroupedView rows={filtered} page={page} onPage={onPage} />
      ) : (
        <TableView
          rows={filtered}
          sort={{ key: sortKey, dir: sortDir }}
          toggleSort={toggleSort}
          page={page}
          onPage={onPage}
        />
      )}
    </div>
  );
}

function matchStatus(r: ModerationRow, status: StatusFilter): boolean {
  switch (status) {
    case 'approved':
      return r.status === 'APPROVED';
    case 'removed':
      return r.status === 'REMOVED';
    case 'unverified':
      return r.canVerify && !r.verified;
    default:
      return true;
  }
}

function Filters({
  search,
  setSearch,
  section,
  setSection,
  status,
  setStatus,
  faculty,
  setFaculty,
  faculties,
  department,
  setDepartment,
  departments,
  indicator,
  setIndicator,
  indicators,
  grouped,
  setGrouped,
}: {
  search: string;
  setSearch: (v: string) => void;
  section: number | null;
  setSection: (v: number | null) => void;
  status: StatusFilter;
  setStatus: (v: StatusFilter) => void;
  faculty: string;
  setFaculty: (v: string) => void;
  faculties: string[];
  department: string;
  setDepartment: (v: string) => void;
  departments: string[];
  indicator: string;
  setIndicator: (v: string) => void;
  indicators: { itemNumber: string; label: string }[];
  grouped: boolean;
  setGrouped: (v: boolean) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Пошук за ПІБ..."
            className="w-56 pl-8"
          />
        </div>

        <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={faculty} onValueChange={setFaculty}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Факультет" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Усі факультети</SelectItem>
            {faculties.map((f) => (
              <SelectItem key={f} value={f}>
                {f}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* This list keys кафедри by NAME, not by id — it filters rows that
            already carry the name — so each one is its own `id` here. */}
        <div className="w-56">
          <DepartmentCombobox
            departments={departments.map((d) => ({ id: d, name: d }))}
            value={department === 'all' ? '' : department}
            onChange={(next) => setDepartment(next || 'all')}
            allowAll={{ label: 'Усі кафедри' }}
            placeholder="Кафедра"
          />
        </div>

        <Button
          variant={grouped ? 'secondary' : 'outline'}
          size="sm"
          onClick={() => setGrouped(!grouped)}
          className="ml-auto"
        >
          Групувати за НПП
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <Button
          variant={section === null ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setSection(null)}
        >
          Всі розділи
        </Button>
        {SECTIONS.map((s) => (
          <Button
            key={s}
            variant={section === s ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setSection(s)}
          >
            Розділ {s}
          </Button>
        ))}

        <Select value={indicator} onValueChange={setIndicator}>
          <SelectTrigger className="ml-auto w-96">
            <SelectValue placeholder="Показник" />
          </SelectTrigger>
          <SelectContent className="max-w-xl">
            <SelectItem value="all">Усі показники</SelectItem>
            {indicators.map((i) => (
              <SelectItem key={i.itemNumber} value={i.itemNumber}>
                <span className="mr-1.5 text-muted-foreground tabular-nums">{i.itemNumber}</span>
                {i.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

/** Default view: one sortable, paginated row per submission. */
function TableView({
  rows,
  sort,
  toggleSort,
  page,
  onPage,
}: {
  rows: ModerationRow[];
  sort: { key: SortKey; dir: 'asc' | 'desc' };
  toggleSort: (key: SortKey) => void;
  page: number;
  onPage: (page: number) => void;
}) {
  const totalPages = Math.ceil(rows.length / PAGE_ROWS);
  const current = Math.min(page, totalPages);
  const slice = rows.slice((current - 1) * PAGE_ROWS, current * PAGE_ROWS);

  // Which row the panel is showing, as an index into the page being worked
  // through. Kept as an index rather than an id so «next» is one line, and
  // scoped to the page so the arrows never walk past the pager.
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const openRow = openIndex === null ? null : (slice[openIndex] ?? null);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* `table-fixed` is what stops the overflow. On auto layout the widest
          «Показник» label sets the column's width and the table grows past its
          container; fixed layout makes the declared widths binding and the long
          label wrap instead. Every column is sized except «Показник», which
          takes whatever is left.

          The table carries only what somebody scans for — who, where, which
          indicator, how much, and whether it counts. Everything else about a
          submission, and everything that can be DONE to it, lives in the panel
          a row click opens: a date nobody reads while scanning and two buttons
          per row cost more width than they were worth. */}
      {/* The floor matters as much as the fixed layout. The five sized columns
          come to ~31rem; without a minimum, a narrow laptop leaves «Показник»
          about one character wide and the label wraps a letter per line. Below
          this width the wrapper scrolls sideways instead — a scrollbar is a far
          smaller price than an unreadable column. */}
      <DataTable fill className="min-w-[48rem] table-fixed">
        <thead>
          <tr className="border-b bg-muted/40">
            {/* Holds «Прізвище І. П.» on one line. The full name is the cell's
                tooltip — see the note on the cell itself. */}
            <Th label="ПІБ" k="name" sort={sort} onSort={toggleSort} className="w-44" />
            <Th label="Кафедра" k="department" sort={sort} onSort={toggleSort} className="w-36" />
            {/* The heading is the only thing needing width here — the values are
                single digits — so it is abbreviated, with the word on hover.
                «Розд.» plus its sort arrow measures 59px, which is why the
                padding drops to px-2: at px-3 the column would have to be w-24
                to avoid clipping, and that is visibly too much for one digit. */}
            <Th
              label="Розд."
              title="Розділ"
              k="section"
              sort={sort}
              onSort={toggleSort}
              align="right"
              className="w-20 px-2"
            />
            <Th label="Показник" k="item" sort={sort} onSort={toggleSort} />
            <Th
              label="Бали"
              k="score"
              sort={sort}
              onSort={toggleSort}
              align="right"
              className="w-20"
            />
            <th className="w-28 px-3 py-2.5 text-left font-medium text-muted-foreground">Статус</th>
          </tr>
        </thead>
        <tbody>
          {slice.map((row, i) => (
            <tr
              key={row.id}
              className="cursor-pointer align-top transition-colors"
              onClick={(e) => {
                // The action cell has its own controls, and a dialog opened from
                // one of them must not also open the panel behind it.
                if ((e.target as HTMLElement).closest('button, a, [role="dialog"]')) return;
                setOpenIndex(i);
              }}
            >
              {/* Short form so a full Ukrainian ПІБ stops wrapping onto two and
                  three lines. The full name is one hover away, and is still
                  what search, sorting and the discard dialog use. */}
              <td className="truncate px-3 py-2.5 font-medium" title={row.staffName}>
                {row.staffShortName}
              </td>
              <td className="px-3 py-2.5 break-words text-muted-foreground">
                {row.department || '—'}
              </td>
              {/* px-2 to match its header, or the digit and the heading above it
                  would sit on two different right edges */}
              <td className="px-2 py-2.5 text-right text-muted-foreground tabular-nums">
                {row.section}
              </td>
              <td className="px-3 py-2.5 break-words">
                <span className="mr-1.5 text-muted-foreground tabular-nums">{row.itemNumber}</span>
                {row.label}
                {/* Truncation needs a bounded width to mean anything — under the
                    old auto layout this line simply widened the whole table. */}
                {row.summary && (
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {row.summary}
                  </span>
                )}
                {row.status === 'REMOVED' && row.removeReason && (
                  <span className="mt-0.5 block text-xs text-destructive">
                    Причина: {row.removeReason}
                  </span>
                )}
              </td>
              <td
                className={cn(
                  'px-3 py-2.5 text-right font-semibold tabular-nums',
                  row.status === 'REMOVED' && 'text-muted-foreground line-through'
                )}
              >
                {row.score}
              </td>
              <td className="px-3 py-2.5">
                <StatusPill row={row} />
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>

      <Pager
        current={current}
        totalPages={totalPages}
        onPage={onPage}
        unit="подань"
        total={rows.length}
      />

      <SubmissionPanel
        row={openRow}
        open={openIndex !== null}
        onOpenChange={(next) => !next && setOpenIndex(null)}
      />
    </div>
  );
}

/** «Групувати за НПП»: one collapsible card per person with a running total. */
function GroupedView({
  rows,
  page,
  onPage,
}: {
  rows: ModerationRow[];
  page: number;
  onPage: (page: number) => void;
}) {
  const people = useMemo(() => {
    const map = new Map<string, ModerationRow[]>();
    for (const r of rows) {
      const list = map.get(r.staffName) ?? [];
      list.push(r);
      map.set(r.staffName, list);
    }
    return Array.from(map.entries())
      .map(([name, items]) => ({
        name,
        department: items[0].department,
        // Inside a card the submissions read as the catalogue does: 1.1, 1.2, … 3.14
        items: [...items].sort((a, b) => compareItemNumbers(a.itemNumber, b.itemNumber)),
        // Only counted rows add up — the total mirrors the rating
        total: sumScores(items.filter((i) => i.status === 'APPROVED').map((i) => i.score)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'uk'));
  }, [rows]);

  const totalPages = Math.ceil(people.length / PAGE_PEOPLE);
  const current = Math.min(page, totalPages);
  const slice = people.slice((current - 1) * PAGE_PEOPLE, current * PAGE_PEOPLE);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="min-h-64 flex-1 space-y-2 overflow-y-auto">
        {slice.map((person) => (
          <details key={person.name} className="rounded-xl border bg-card">
            <summary className="flex cursor-pointer items-center gap-3 px-4 py-3 select-none">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{person.name}</p>
                {person.department && (
                  <p className="truncate text-xs text-muted-foreground">{person.department}</p>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                {UK.submission(person.items.length)}
              </span>
              <span className="text-sm font-semibold tabular-nums">{person.total}</span>
            </summary>

            <ul className="divide-y border-t">
              {person.items.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5"
                >
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {row.itemNumber}
                  </span>
                  <span className="min-w-0 flex-1 text-sm">{row.label}</span>
                  <StatusPill row={row} />
                  <span
                    className={cn(
                      'text-sm font-semibold tabular-nums',
                      row.status === 'REMOVED' && 'text-muted-foreground line-through'
                    )}
                  >
                    {row.score}
                  </span>
                  <RowActions row={row} />
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>

      <Pager
        current={current}
        totalPages={totalPages}
        onPage={onPage}
        unit="НПП"
        total={people.length}
      />
    </div>
  );
}

function Th({
  label,
  title,
  k,
  sort,
  onSort,
  align = 'left',
  className,
}: {
  label: string;
  /** Spelled out on hover where `label` had to be abbreviated to fit */
  title?: string;
  k: SortKey;
  sort: { key: SortKey; dir: 'asc' | 'desc' };
  onSort: (key: SortKey) => void;
  align?: 'left' | 'right';
  className?: string;
}) {
  const active = sort.key === k;
  return (
    <th
      className={cn(
        'px-3 py-2.5 font-medium text-muted-foreground',
        align === 'right' ? 'text-right' : 'text-left',
        className
      )}
    >
      <button
        type="button"
        title={title}
        onClick={() => onSort(k)}
        className={cn(
          'inline-flex items-center gap-1 transition-colors hover:text-foreground',
          align === 'right' && 'flex-row-reverse'
        )}
      >
        {label}
        {active ? (
          sort.dir === 'asc' ? (
            <ChevronUp className="size-3.5" />
          ) : (
            <ChevronDown className="size-3.5" />
          )
        ) : (
          <ChevronsUpDown className="size-3.5 opacity-40" />
        )}
      </button>
    </th>
  );
}

function StatusPill({ row }: { row: ModerationRow }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        STATUS_STYLES[row.status]
      )}
    >
      {row.statusLabel}
    </span>
  );
}

function RowActions({ row }: { row: ModerationRow }) {
  return (
    <>
      {row.canVerify ? (
        <VerifyActivityButton activityId={row.id} verified={row.verified} />
      ) : (
        // Read-only (closed year): state only, no toggle.
        row.verified && (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-600">
            <Eye className="size-3.5" />
            Перевірено
          </span>
        )
      )}
      {row.canDiscard && (
        <DiscardActivityButton activityId={row.id} label={row.label} staffName={row.staffName} />
      )}
    </>
  );
}

function Pager({
  current,
  totalPages,
  onPage,
  unit,
  total,
}: {
  current: number;
  totalPages: number;
  onPage: (page: number) => void;
  unit: string;
  total: number;
}) {
  return (
    <Pagination
      page={current}
      totalPages={totalPages}
      onPageChange={onPage}
      summary={
        <>
          Стор. {current} з {totalPages} · {total} {unit}
        </>
      }
    />
  );
}

/** Distinct non-empty values, alphabetical in Ukrainian — for the filter dropdowns */
function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, 'uk'));
}
