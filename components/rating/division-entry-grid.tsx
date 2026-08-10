'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { useForm, type FieldValues, type Resolver } from 'react-hook-form';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  upsertDivisionActivity,
  clearDivisionActivity,
} from '@/app/(dashboard)/division-data/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EvidenceFields } from '@/components/rating/evidence-fields';
import { evidenceDefaults, type EvidenceField } from '@/lib/rating/evidence-fields';
import type { ScoringSpec } from '@/lib/rating/scoring';
import { schemaForFields } from '@/validations/activity-evidence';
import { cn } from '@/lib/utils';

export interface EntryGridType {
  id: string;
  code: string;
  itemNumber: string;
  label: string;
  coefficientNote: string | null;
  fields: EvidenceField[];
  /** Needed for the rule-level checks, e.g. CHECK_SUM's «tick at least one» */
  scoring: ScoringSpec;
}

export interface EntryGridStaff {
  id: string;
  name: string;
  department: string;
}

export interface EntryGridCell {
  id: string;
  score: number;
  evidence: unknown;
}

interface DivisionEntryGridProps {
  types: EntryGridType[];
  staff: EntryGridStaff[];
  /** key = `${staffId}:${activityTypeId}` */
  entries: Record<string, EntryGridCell>;
  readOnly?: boolean;
}

// Staff-first grid: one row per НПП, one column per division-managed item.
// Click a cell to enter/correct the value for the open year.
const PAGE_SIZE = 40;

type SortKey = 'name' | 'department' | 'filled-desc' | 'filled-asc';
type Filled = 'all' | 'with-data' | 'empty';

const SORT_LABELS: Record<SortKey, string> = {
  name: 'За ПІБ',
  department: 'За кафедрою',
  'filled-desc': 'Спершу заповнені',
  'filled-asc': 'Спершу порожні',
};

const FILLED_LABELS: Record<Filled, string> = {
  all: 'Усі',
  'with-data': 'Із даними',
  empty: 'Без даних',
};

// Staff-first grid: one row per НПП, one column per division-managed item.
// Click a cell to enter/correct the value for the open year.
export function DivisionEntryGrid({ types, staff, entries, readOnly }: DivisionEntryGridProps) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('name');
  const [filled, setFilled] = useState<Filled>('all');
  const [page, setPage] = useState(0);
  const scrollBox = useRef<HTMLDivElement>(null);

  const matching = useMemo(() => {
    /** How many of this division's columns already hold a value for one person */
    const countFor = (staffId: string) =>
      types.reduce((n, t) => (entries[`${staffId}:${t.id}`] ? n + 1 : n), 0);

    const q = query.trim().toLowerCase();
    const byName = (a: EntryGridStaff, b: EntryGridStaff) => a.name.localeCompare(b.name, 'uk');

    const rows = staff.filter((s) => {
      if (q && !s.name.toLowerCase().includes(q) && !s.department.toLowerCase().includes(q)) {
        return false;
      }
      if (filled === 'all') return true;
      const has = countFor(s.id) > 0;
      return filled === 'with-data' ? has : !has;
    });

    const sorted = [...rows];
    switch (sort) {
      case 'name':
        sorted.sort(byName);
        break;
      case 'department':
        sorted.sort((a, b) => a.department.localeCompare(b.department, 'uk') || byName(a, b));
        break;
      case 'filled-desc':
        sorted.sort((a, b) => countFor(b.id) - countFor(a.id) || byName(a, b));
        break;
      case 'filled-asc':
        sorted.sort((a, b) => countFor(a.id) - countFor(b.id) || byName(a, b));
        break;
    }
    return sorted;
  }, [staff, entries, types, query, sort, filled]);

  const pageCount = Math.max(1, Math.ceil(matching.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const visibleStaff = matching.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  // The grid scrolls inside its own box, so a new page would otherwise open at
  // whatever offset the last one was left at — halfway down a list of names you
  // have never seen. Every change of what is shown starts at the top.
  function show(nextPage: number) {
    setPage(nextPage);
    scrollBox.current?.scrollTo({ top: 0 });
  }

  // Narrowing the list must not leave you stranded on a page that no longer exists
  function change<T>(set: (v: T) => void) {
    return (v: T) => {
      set(v);
      show(0);
    };
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-64 flex-1 sm:max-w-sm">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => change(setQuery)(e.target.value)}
            placeholder="Пошук НПП або кафедри…"
            className="pl-9"
            aria-label="Пошук НПП"
          />
        </div>

        <Select value={sort} onValueChange={(v) => change(setSort)(v as SortKey)}>
          <SelectTrigger className="w-44" aria-label="Сортування">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(SORT_LABELS).map(([v, label]) => (
              <SelectItem key={v} value={v}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filled} onValueChange={(v) => change(setFilled)(v as Filled)}>
          <SelectTrigger className="w-36" aria-label="Фільтр за даними">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(FILLED_LABELS).map(([v, label]) => (
              <SelectItem key={v} value={v}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="ml-auto text-sm whitespace-nowrap text-muted-foreground">
          {matching.length} із {staff.length}
        </span>
      </div>

      {/* Scrolls in both directions inside its own box rather than with the
          page. A page-level scroll took the column headings out of view, and on
          a grid this wide you then cannot tell which indicator a cell belongs
          to. Sticky only resolves against a scrollport, so the height cap is
          what makes the header stick at all — not decoration. */}
      <div
        ref={scrollBox}
        className="max-h-[calc(100vh-16rem)] overflow-auto rounded-xl border bg-card"
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left">
              {/* The corner sits above both sticky axes, so it outranks each */}
              <th className="sticky top-0 left-0 z-30 min-w-56 border-r border-b bg-muted px-4 py-3 font-medium">
                НПП
              </th>
              {types.map((t) => (
                <th
                  key={t.id}
                  className="sticky top-0 z-20 min-w-48 border-b bg-muted px-3 py-3 align-top font-medium"
                >
                  <span className="block text-xs text-muted-foreground">{t.itemNumber}</span>
                  <span>{t.label}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleStaff.map((s) => (
              <tr key={s.id} className="border-b last:border-b-0 hover:bg-muted/30">
                {/* Opaque, not translucent: rows scroll underneath it */}
                <td className="sticky left-0 z-10 border-r bg-card px-4 py-2">
                  <span className="block font-medium">{s.name}</span>
                  <span className="block text-xs text-muted-foreground">{s.department}</span>
                </td>
                {types.map((t) => (
                  <td key={t.id} className="px-3 py-2">
                    <EntryCell
                      type={t}
                      staffId={s.id}
                      staffName={s.name}
                      entry={entries[`${s.id}:${t.id}`]}
                      readOnly={readOnly}
                    />
                  </td>
                ))}
              </tr>
            ))}
            {visibleStaff.length === 0 && (
              <tr>
                <td
                  colSpan={types.length + 1}
                  className="px-4 py-10 text-center text-muted-foreground"
                >
                  Нікого не знайдено
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* The shared pager is 1-based; `page` here is a 0-based slice index */}
      <Pagination page={current + 1} totalPages={pageCount} onPageChange={(p) => show(p - 1)} />
    </div>
  );
}

function EntryCell({
  type,
  staffId,
  staffName,
  entry,
  readOnly,
}: {
  type: EntryGridType;
  staffId: string;
  staffName: string;
  entry?: EntryGridCell;
  readOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const valueButton = (
    <button
      type="button"
      disabled={readOnly}
      className={cn(
        'min-w-14 rounded-md border px-2.5 py-1 text-left tabular-nums transition-colors',
        entry
          ? 'border-transparent bg-primary/10 font-medium text-primary'
          : 'border-dashed text-muted-foreground',
        !readOnly && 'cursor-pointer hover:border-primary/50'
      )}
      aria-label={`${type.label} — ${staffName}`}
    >
      {entry ? entry.score : '—'}
    </button>
  );

  if (readOnly) return valueButton;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{valueButton}</PopoverTrigger>
      <PopoverContent align="start" className="w-96">
        {/* key remounts the form each open so stale values never linger */}
        {open && (
          <CellForm
            key={entry?.id ?? 'new'}
            type={type}
            staffId={staffId}
            staffName={staffName}
            entry={entry}
            onDone={() => setOpen(false)}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

function CellForm({
  type,
  staffId,
  staffName,
  entry,
  onDone,
}: {
  type: EntryGridType;
  staffId: string;
  staffName: string;
  entry?: EntryGridCell;
  onDone: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  // useState initializer: fields are static for this mount (form remounts per open)
  const [schema] = useState(() => schemaForFields(type.fields, type.scoring));

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FieldValues>({
    // schemas vary per activity type, so the form is untyped by design
    resolver: standardSchemaResolver(schema as never) as unknown as Resolver<FieldValues>,
    defaultValues: {
      ...evidenceDefaults(type.fields),
      ...((entry?.evidence as Record<string, unknown>) ?? {}),
    },
  });

  function onSubmit(data: FieldValues) {
    startTransition(async () => {
      const result = await upsertDivisionActivity(staffId, type.id, data);
      if ('error' in result) {
        toast.error(result.error);
      } else {
        toast.success(`Збережено: ${result.score} балів`);
        onDone();
      }
    });
  }

  function onClear() {
    if (!entry) return;
    startTransition(async () => {
      const result = await clearDivisionActivity(entry.id);
      if ('error' in result) {
        toast.error(result.error);
      } else {
        toast.success('Запис видалено');
        onDone();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <p className="text-sm font-semibold">{type.label}</p>
        <p className="text-xs text-muted-foreground">{staffName}</p>
      </div>
      {type.coefficientNote && (
        <p className="text-xs whitespace-pre-line text-muted-foreground">{type.coefficientNote}</p>
      )}
      <EvidenceFields fields={type.fields} register={register} control={control} errors={errors} />
      <div className="flex items-center justify-between gap-2">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? 'Збереження…' : 'Зберегти'}
        </Button>
        {entry && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={onClear}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="size-4" />
            Видалити
          </Button>
        )}
      </div>
    </form>
  );
}
