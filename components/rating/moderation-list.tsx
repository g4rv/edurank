'use client';

import { useMemo, useState } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown, Eye, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DiscardActivityButton } from '@/components/rating/discard-activity-button';
import { VerifyActivityButton } from '@/components/rating/verify-activity-button';
import { compareItemNumbers } from '@/lib/rating/achievement-rows';

export interface ModerationRow {
  id: string;
  staffName: string;
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
  date: string;
  /** createdAt millis — for sorting; `date` is the display form */
  ts: number;
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

type SortKey = 'name' | 'department' | 'section' | 'item' | 'score' | 'date';
type StatusFilter = 'all' | 'approved' | 'removed' | 'unverified';

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Усі статуси' },
  { value: 'approved', label: 'Зараховані' },
  { value: 'removed', label: 'Відхилені' },
  { value: 'unverified', label: 'Публікації без перевірки' },
];

export function ModerationList({ rows }: { rows: ModerationRow[] }) {
  const [section, setSection] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [faculty, setFaculty] = useState('all');
  const [department, setDepartment] = useState('all');
  // Selected by itemNumber — unique inside one year's template
  const [indicator, setIndicator] = useState('all');
  const [grouped, setGrouped] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'name',
    dir: 'asc',
  });
  const [page, setPage] = useState(1);

  // Any change to what's shown starts the list at the top again — done in the
  // filter handlers, not an effect, so there's no cascading re-render.
  const withReset =
    <A extends unknown[]>(fn: (...args: A) => void) =>
    (...args: A) => {
      setPage(1);
      fn(...args);
    };

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

    const sign = sort.dir === 'asc' ? 1 : -1;
    const compare = (a: ModerationRow, b: ModerationRow): number => {
      switch (sort.key) {
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
        case 'date':
          return a.ts - b.ts;
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
  }, [rows, section, search, faculty, department, indicator, status, sort]);

  // Narrowing a parent filter can strand its child on a value that no longer
  // exists, so the child resets with it — in the handler, not an effect.
  function changeFaculty(value: string) {
    setPage(1);
    setFaculty(value);
    setDepartment('all');
  }

  function changeSection(value: number | null) {
    setPage(1);
    setSection(value);
    setIndicator('all');
  }

  function toggleSort(key: SortKey) {
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }
    );
  }

  return (
    <div className="space-y-4">
      <Filters
        search={search}
        setSearch={withReset(setSearch)}
        section={section}
        setSection={changeSection}
        status={status}
        setStatus={withReset(setStatus)}
        faculty={faculty}
        setFaculty={changeFaculty}
        faculties={faculties}
        department={department}
        setDepartment={withReset(setDepartment)}
        departments={departments}
        indicator={indicator}
        setIndicator={withReset(setIndicator)}
        indicators={indicators}
        grouped={grouped}
        setGrouped={withReset(setGrouped)}
      />

      <p className="text-sm text-muted-foreground">
        Знайдено {filtered.length} подань
        {faculty !== 'all' && ` · ${faculty}`}
        {department !== 'all' && ` · ${department}`}
        {indicator !== 'all' && ` · п. ${indicator}`}
      </p>

      {filtered.length === 0 ? (
        <div className="rounded-xl border bg-card px-6 py-10 text-center text-sm text-muted-foreground">
          Подань не знайдено.
        </div>
      ) : grouped ? (
        <GroupedView rows={filtered} page={page} setPage={setPage} />
      ) : (
        <TableView
          rows={filtered}
          sort={sort}
          toggleSort={toggleSort}
          page={page}
          setPage={setPage}
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

        <Select value={department} onValueChange={setDepartment}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Кафедра" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Усі кафедри</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d} value={d}>
                {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

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
  setPage,
}: {
  rows: ModerationRow[];
  sort: { key: SortKey; dir: 'asc' | 'desc' };
  toggleSort: (key: SortKey) => void;
  page: number;
  setPage: (updater: (p: number) => number) => void;
}) {
  const totalPages = Math.ceil(rows.length / PAGE_ROWS);
  const current = Math.min(page, totalPages);
  const slice = rows.slice((current - 1) * PAGE_ROWS, current * PAGE_ROWS);

  return (
    <div className="space-y-3">
      <DataTable>
        <thead>
          <tr className="border-b bg-muted/40">
            <Th label="ПІБ" k="name" sort={sort} onSort={toggleSort} />
            <Th label="Кафедра" k="department" sort={sort} onSort={toggleSort} />
            <Th
              label="Розділ"
              k="section"
              sort={sort}
              onSort={toggleSort}
              align="right"
              className="w-20"
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
            <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Статус</th>
            <Th label="Дата" k="date" sort={sort} onSort={toggleSort} className="w-28" />
            <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">Дії</th>
          </tr>
        </thead>
        <tbody>
          {slice.map((row) => (
            <tr key={row.id} className="align-top transition-colors">
              <td className="px-3 py-2.5 font-medium">{row.staffName}</td>
              <td className="px-3 py-2.5 text-muted-foreground">{row.department || '—'}</td>
              <td className="px-3 py-2.5 text-right text-muted-foreground tabular-nums">
                {row.section}
              </td>
              <td className="px-3 py-2.5">
                <span className="mr-1.5 text-muted-foreground tabular-nums">{row.itemNumber}</span>
                {row.label}
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
              <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">{row.date}</td>
              <td className="px-3 py-2.5">
                <div className="flex items-center justify-end gap-2">
                  <RowActions row={row} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>

      <Pager
        current={current}
        totalPages={totalPages}
        setPage={setPage}
        unit="подань"
        total={rows.length}
      />
    </div>
  );
}

/** «Групувати за НПП»: one collapsible card per person with a running total. */
function GroupedView({
  rows,
  page,
  setPage,
}: {
  rows: ModerationRow[];
  page: number;
  setPage: (updater: (p: number) => number) => void;
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
        total: items.filter((i) => i.status === 'APPROVED').reduce((s, i) => s + i.score, 0),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'uk'));
  }, [rows]);

  const totalPages = Math.ceil(people.length / PAGE_PEOPLE);
  const current = Math.min(page, totalPages);
  const slice = people.slice((current - 1) * PAGE_PEOPLE, current * PAGE_PEOPLE);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {slice.map((person) => (
          <details key={person.name} className="rounded-xl border bg-card">
            <summary className="flex cursor-pointer items-center gap-3 px-4 py-3 select-none">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{person.name}</p>
                {person.department && (
                  <p className="truncate text-xs text-muted-foreground">{person.department}</p>
                )}
              </div>
              <span className="text-xs text-muted-foreground">{person.items.length} подань</span>
              <span className="text-sm font-semibold tabular-nums">{round2(person.total)}</span>
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
        setPage={setPage}
        unit="НПП"
        total={people.length}
      />
    </div>
  );
}

function Th({
  label,
  k,
  sort,
  onSort,
  align = 'left',
  className,
}: {
  label: string;
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
  setPage,
  unit,
  total,
}: {
  current: number;
  totalPages: number;
  setPage: (updater: (p: number) => number) => void;
  unit: string;
  total: number;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between text-sm text-muted-foreground">
      <span>
        Стор. {current} з {totalPages} · {total} {unit}
      </span>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={current <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          ← Попередня
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={current >= totalPages}
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
        >
          Наступна →
        </Button>
      </div>
    </div>
  );
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Distinct non-empty values, alphabetical in Ukrainian — for the filter dropdowns */
function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, 'uk'));
}
