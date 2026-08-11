'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { useForm, type FieldValues, type Resolver } from 'react-hook-form';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  upsertDivisionActivity,
  clearDivisionActivity,
} from '@/app/(dashboard)/division-data/actions';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EvidenceFields } from '@/components/rating/evidence-fields';
import {
  evidenceDefaults,
  summarizeEvidence,
  type EvidenceField,
} from '@/lib/rating/evidence-fields';
import type { ScoringSpec } from '@/lib/rating/scoring';
import { schemaForFields } from '@/validations/activity-evidence';
import { cn } from '@/lib/utils';
import { sumScores } from '@/lib/round';

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
  /** key = `${staffId}:${activityTypeId}` — several records per cell are normal */
  entries: Record<string, EntryGridCell[]>;
  readOnly?: boolean;
}

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
      types.reduce((n, t) => ((entries[`${staffId}:${t.id}`]?.length ?? 0) > 0 ? n + 1 : n), 0);

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
                      entries={entries[`${s.id}:${t.id}`] ?? []}
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
  entries,
  readOnly,
}: {
  type: EntryGridType;
  staffId: string;
  staffName: string;
  entries: EntryGridCell[];
  readOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // `null` = the list; a cell = editing that one; 'new' = adding another
  const [editing, setEditing] = useState<EntryGridCell | 'new' | null>(null);

  // Rounded for the same reason as the rating table's subtotals: this is
  // summed on every render, so rounding the stored scores never reached it.
  const total = sumScores(entries.map((e) => e.score));
  const many = entries.length > 1;

  const valueButton = (
    <button
      type="button"
      disabled={readOnly}
      className={cn(
        'min-w-14 rounded-md border px-2.5 py-1 text-left tabular-nums transition-colors',
        entries.length > 0
          ? 'border-transparent bg-primary/10 font-medium text-primary'
          : 'border-dashed text-muted-foreground',
        !readOnly && 'cursor-pointer hover:border-primary/50'
      )}
      aria-label={
        entries.length > 0
          ? `${type.label} — ${staffName}: ${entries.length} зап., разом ${total}`
          : `${type.label} — ${staffName}`
      }
    >
      {entries.length > 0 ? total : '—'}
      {/* Without the count a cell holding two records is indistinguishable from
          one holding a single larger score, and the second one stays hidden. */}
      {many && <span className="ml-1 text-xs font-normal opacity-70">×{entries.length}</span>}
    </button>
  );

  if (readOnly) return valueButton;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        // Always reopen on the list, never on whatever was last edited
        if (!v) setEditing(null);
        else setEditing(entries.length === 0 ? 'new' : null);
      }}
    >
      <AlertDialogTrigger asChild>{valueButton}</AlertDialogTrigger>
      <AlertDialogContent className="max-w-xl">
        <AlertDialogHeader>
          <AlertDialogTitle>{type.label}</AlertDialogTitle>
          <AlertDialogDescription>{staffName}</AlertDialogDescription>
        </AlertDialogHeader>

        {editing === null ? (
          <>
            <EntryList
              type={type}
              entries={entries}
              onEdit={setEditing}
              onAdd={() => setEditing('new')}
              onDone={() => setOpen(false)}
            />
            <AlertDialogFooter>
              <AlertDialogCancel>Закрити</AlertDialogCancel>
            </AlertDialogFooter>
          </>
        ) : (
          // No «Закрити» beside the form: it would sit next to «Назад» meaning
          // something almost but not quite the same, and the two rows of
          // buttons read as two separate footers.
          <CellForm
            // Remounts per record so a previous one's values never linger
            key={editing === 'new' ? 'new' : editing.id}
            type={type}
            staffId={staffId}
            entry={editing === 'new' ? undefined : editing}
            onDone={() => (entries.length > 0 ? setEditing(null) : setOpen(false))}
            onCancel={() => (entries.length === 0 ? setOpen(false) : setEditing(null))}
          />
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** What this person already has under this indicator, with a way to add another */
function EntryList({
  type,
  entries,
  onEdit,
  onAdd,
  onDone,
}: {
  type: EntryGridType;
  entries: EntryGridCell[];
  onEdit: (e: EntryGridCell) => void;
  onAdd: () => void;
  onDone: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  function remove(id: string) {
    startTransition(async () => {
      const result = await clearDivisionActivity(id);
      if ('error' in result) toast.error(result.error);
      else {
        toast.success('Запис видалено');
        if (entries.length <= 1) onDone();
      }
    });
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {entries.map((e) => (
          <li key={e.id} className="flex items-center gap-3 rounded-lg border px-3 py-2">
            {/* The description takes the slack so the score, the action and the
                bin land on the same x across every row — a ragged right edge
                here reads as three unrelated controls rather than one set. */}
            <p className="min-w-0 flex-1 text-sm break-words">
              {summarizeEvidence(type.fields, e.evidence) || 'Без опису'}
            </p>
            <span className="w-14 shrink-0 text-right text-sm font-semibold tabular-nums">
              {e.score}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isPending}
              onClick={() => onEdit(e)}
              className="shrink-0"
            >
              Змінити
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={isPending}
              onClick={() => remove(e.id)}
              aria-label="Видалити запис"
              className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-4" />
            </Button>
          </li>
        ))}
      </ul>

      <Button type="button" variant="outline" size="sm" onClick={onAdd} disabled={isPending}>
        <Plus className="size-4" />
        Додати запис
      </Button>
    </div>
  );
}

function CellForm({
  type,
  staffId,
  entry,
  onDone,
  onCancel,
}: {
  type: EntryGridType;
  staffId: string;
  /** Absent = adding another record rather than correcting one */
  entry?: EntryGridCell;
  onDone: () => void;
  onCancel: () => void;
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
      const result = await upsertDivisionActivity(staffId, type.id, data, entry?.id);
      if ('error' in result) {
        toast.error(result.error);
      } else {
        toast.success(`Збережено: ${result.score} балів`);
        onDone();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {type.coefficientNote && (
        <p className="text-xs whitespace-pre-line text-muted-foreground">{type.coefficientNote}</p>
      )}
      <EvidenceFields fields={type.fields} register={register} control={control} errors={errors} />
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? 'Збереження…' : 'Зберегти'}
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={isPending} onClick={onCancel}>
          Назад
        </Button>
      </div>
    </form>
  );
}
