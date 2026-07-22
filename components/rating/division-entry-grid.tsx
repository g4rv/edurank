'use client';

import { useMemo, useState, useTransition } from 'react';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { EvidenceFields } from '@/components/rating/evidence-fields';
import { evidenceDefaults, type EvidenceField } from '@/lib/rating/evidence-fields';
import { schemaForFields } from '@/validations/activity-evidence';
import { cn } from '@/lib/utils';

export interface EntryGridType {
  id: string;
  code: string;
  itemNumber: string;
  label: string;
  coefficientNote: string | null;
  fields: EvidenceField[];
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
export function DivisionEntryGrid({ types, staff, entries, readOnly }: DivisionEntryGridProps) {
  const [query, setQuery] = useState('');

  const visibleStaff = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return staff;
    return staff.filter(
      (s) => s.name.toLowerCase().includes(q) || s.department.toLowerCase().includes(q)
    );
  }, [staff, query]);

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Пошук НПП або кафедри…"
          className="pl-9"
          aria-label="Пошук НПП"
        />
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left">
              <th className="sticky left-0 z-10 min-w-56 bg-muted/50 px-4 py-3 font-medium backdrop-blur">
                НПП
              </th>
              {types.map((t) => (
                <th key={t.id} className="min-w-32 px-3 py-3 align-bottom font-medium">
                  <span className="block text-xs text-muted-foreground">{t.itemNumber}</span>
                  <span className="line-clamp-2" title={t.label}>
                    {t.label}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleStaff.map((s) => (
              <tr key={s.id} className="border-b last:border-b-0 hover:bg-muted/30">
                <td className="sticky left-0 z-10 bg-card px-4 py-2 backdrop-blur">
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
  const [schema] = useState(() => schemaForFields(type.fields));

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
