'use client';

import { useMemo, useState, useTransition } from 'react';
import { useForm, type FieldValues } from 'react-hook-form';
import { Plus, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { batchUpsertDivisionActivity } from '@/app/(dashboard)/division-data/actions';
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
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EvidenceFields } from '@/components/rating/evidence-fields';
import { evidenceDefaults } from '@/lib/rating/evidence-fields';
import { entityEntryMeta } from '@/lib/rating/entity-entry';
import { activityTypeMeta } from '@/lib/rating/registry';
import { SELECT_OPTION_POINTS } from '@/lib/rating/scoring';
import type { EntryGridStaff, EntryGridType } from '@/components/rating/division-entry-grid';

interface EntityEntryDialogProps {
  types: EntryGridType[];
  staff: EntryGridStaff[];
}

interface StaffRow {
  key: number;
  staffId: string;
  role: string;
}

// Entity-first bulk entry: the object once, the people as a list.
export function EntityEntryDialog({ types, staff }: EntityEntryDialogProps) {
  const [open, setOpen] = useState(false);
  const [typeId, setTypeId] = useState(types[0]?.id ?? '');

  const type = types.find((t) => t.id === typeId) ?? types[0];
  if (!type) return null;

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline">
          <Users className="size-4" />
          Групове внесення
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>Групове внесення</AlertDialogTitle>
          <AlertDialogDescription>
            Внесіть об&apos;єкт один раз і оберіть усіх НПП, які беруть у ньому участь — по одному
            запису на кожного.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2">
          <span className="text-sm font-medium">Показник</span>
          <Select value={type.id} onValueChange={setTypeId}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {types.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.itemNumber} — {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* key remounts the form when the type changes so fields never mix */}
        {open && (
          <EntityEntryForm key={type.id} type={type} staff={staff} onDone={() => setOpen(false)} />
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}

function EntityEntryForm({
  type,
  staff,
  onDone,
}: {
  type: EntryGridType;
  staff: EntryGridStaff[];
  onDone: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const { def, schema } = activityTypeMeta(type.code);
  const { sharedFields, roleField } = entityEntryMeta(type.code);

  const defaultRole = roleField?.options[0]?.value ?? '';
  const [rows, setRows] = useState<StaffRow[]>([{ key: 0, staffId: '', role: defaultRole }]);
  const [nextKey, setNextKey] = useState(1);

  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);

  // No resolver here: the full schema includes the per-row role field, so the
  // assembled evidence is validated in onSubmit (probe) and again server-side.
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FieldValues>({
    defaultValues: evidenceDefaults(sharedFields),
  });

  function addRow() {
    setRows((r) => [...r, { key: nextKey, staffId: '', role: defaultRole }]);
    setNextKey((k) => k + 1);
  }

  function updateRow(key: number, patch: Partial<StaffRow>) {
    setRows((r) => r.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function removeRow(key: number) {
    setRows((r) => (r.length > 1 ? r.filter((row) => row.key !== key) : r));
  }

  function onSubmit(shared: FieldValues) {
    const picked = rows.filter((r) => r.staffId);
    if (picked.length === 0) {
      toast.error('Оберіть хоча б одного НПП');
      return;
    }
    if (new Set(picked.map((r) => r.staffId)).size !== picked.length) {
      toast.error('Один НПП вказано декілька разів');
      return;
    }

    // Validate one assembled evidence object client-side so field errors
    // surface before the server round-trip
    const probe = schema.safeParse(
      roleField ? { ...shared, [roleField.name]: picked[0].role } : shared
    );
    if (!probe.success) {
      toast.error('Заповніть усі поля форми');
      return;
    }

    startTransition(async () => {
      const result = await batchUpsertDivisionActivity(
        type.id,
        picked.map((r) => ({
          staffId: r.staffId,
          evidence: roleField ? { ...shared, [roleField.name]: r.role } : shared,
        }))
      );
      if ('error' in result) {
        toast.error(result.error);
      } else {
        toast.success(`Збережено записів: ${result.saved}`);
        onDone();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {def.coefficientNote && (
        <p className="text-xs whitespace-pre-line text-muted-foreground">{def.coefficientNote}</p>
      )}

      {sharedFields.length > 0 && (
        <EvidenceFields
          code={type.code}
          fields={sharedFields}
          register={register}
          control={control}
          errors={errors}
        />
      )}

      <div className="space-y-2">
        <span className="text-sm font-medium">НПП{roleField ? ' та ролі' : ''}</span>
        <div className="space-y-2">
          {rows.map((row) => {
            const takenElsewhere = new Set(
              rows.filter((r) => r.key !== row.key && r.staffId).map((r) => r.staffId)
            );
            const options = staff.filter((s) => !takenElsewhere.has(s.id));
            return (
              <div key={row.key} className="flex items-start gap-2">
                <Combobox
                  items={options}
                  value={row.staffId}
                  onChange={(v) => updateRow(row.key, { staffId: v })}
                  displayValue={staffById.get(row.staffId)?.name ?? ''}
                  filter={(s, q) =>
                    s.name.toLowerCase().includes(q.toLowerCase()) ||
                    s.department.toLowerCase().includes(q.toLowerCase())
                  }
                >
                  <div className="min-w-0 flex-1">
                    <ComboboxInput placeholder="Оберіть НПП…" />
                    <ComboboxContent>
                      <ComboboxEmpty>Нікого не знайдено</ComboboxEmpty>
                      <ComboboxList<EntryGridStaff>>
                        {(s) => (
                          <ComboboxItem key={s.id} value={s.id}>
                            <span>
                              {s.name}
                              <span className="block text-xs text-muted-foreground">
                                {s.department}
                              </span>
                            </span>
                          </ComboboxItem>
                        )}
                      </ComboboxList>
                    </ComboboxContent>
                  </div>
                </Combobox>

                {roleField && (
                  <Select value={row.role} onValueChange={(v) => updateRow(row.key, { role: v })}>
                    <SelectTrigger className="w-56 shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {roleField.options.map((o) => {
                        const points = (
                          SELECT_OPTION_POINTS as Record<string, Record<string, number>>
                        )[type.code]?.[o.value];
                        return (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                            {points ? ` — ${points}` : ''}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                )}

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeRow(row.key)}
                  disabled={rows.length === 1}
                  aria-label="Прибрати рядок"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            );
          })}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={addRow}>
          <Plus className="size-4" />
          Додати НПП
        </Button>
      </div>

      <AlertDialogFooter>
        <AlertDialogCancel type="button">Скасувати</AlertDialogCancel>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Збереження…' : 'Зберегти всім'}
        </Button>
      </AlertDialogFooter>
    </form>
  );
}
