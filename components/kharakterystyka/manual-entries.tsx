'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Controller,
  useForm,
  useWatch,
  type Control,
  type FieldValues,
  type Resolver,
} from 'react-hook-form';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { ChevronLeft, PencilLine, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { EvidenceFields } from '@/components/rating/evidence-fields';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  addKharakterystykaEntry,
  deleteKharakterystykaEntry,
} from '@/app/(dashboard)/staff/[id]/kharakterystyka/actions';
import { alternativeLabel, positionChoices } from '@/lib/kharakterystyka/positions';
import { positionEvidenceFields } from '@/lib/kharakterystyka/position-evidence';
import { evidenceDefaults, summarizeEvidence } from '@/lib/rating/evidence-fields';
import type { EvidenceField } from '@/lib/rating/evidence-fields';
import { cn } from '@/lib/utils';
import { positionFormSchema } from '@/validations/kharakterystyka';

export interface ManualEntry {
  id: string;
  position: number;
  group: string | null;
  year: number;
  text: string;
}

/**
 * Typing evidence for one п.38 position.
 *
 * Everything else in this document is derived and cannot be edited — see the
 * rule at the top of `lib/kharakterystyka/build.ts`. This is the exception, and
 * it exists because two positions have no indicator at all: п.15 (робота зі
 * школярами) and п.20 (практичний досвід), which rendered as rows nobody could
 * ever fill. It is offered on the other positions too, for the years the app
 * never held a rating for.
 *
 * The cell itself carries no controls (owner, 2026-09-01). Typed rows already
 * print in the evidence list above, labelled «Внесено вручну» — listing them a
 * second time to hang a delete button off was the same rows twice. Everything
 * that changes the document happens inside this dialog.
 *
 * Imported rows are deliberately absent from it. They are replaced wholesale
 * every time the importer runs, so a delete button on one would undo itself on
 * the next run and look like a bug.
 */
export function ManualEntries({
  staffId,
  position,
  entries,
  minYear,
  maxYear,
}: {
  staffId: string;
  position: number;
  entries: ManualEntry[];
  minYear: number;
  maxYear: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 gap-1 px-2 text-xs text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        <PencilLine className="size-3.5" />
        Записи вручну
        {entries.length > 0 && <span className="tabular-nums">· {entries.length}</span>}
      </Button>

      <EntriesDialog
        open={open}
        onOpenChange={setOpen}
        staffId={staffId}
        position={position}
        entries={entries}
        minYear={minYear}
        maxYear={maxYear}
      />
    </div>
  );
}

/**
 * Two screens in one dialog: what is already typed, and the form that adds one
 * more. Saving returns to the list rather than closing, because a position
 * asking for five свідоцтв now needs five rows — see the note on the schema —
 * and typing them must not cost five trips through the table.
 */
function EntriesDialog({
  open,
  onOpenChange,
  staffId,
  position,
  entries,
  minYear,
  maxYear,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staffId: string;
  position: number;
  entries: ManualEntry[];
  minYear: number;
  maxYear: number;
}) {
  const [screen, setScreen] = useState<'list' | 'form'>('list');

  function change(next: boolean) {
    // Reopening on the form somebody abandoned reads as a save that did not
    // happen. The dialog always opens on what the document actually holds.
    if (!next) setScreen('list');
    onOpenChange(next);
  }

  return (
    <AlertDialog open={open} onOpenChange={change}>
      <AlertDialogContent className="max-w-lg">
        {screen === 'list' ? (
          <EntryList
            position={position}
            entries={entries}
            onAdd={() => setScreen('form')}
            onClose={() => change(false)}
          />
        ) : (
          <EntryForm
            staffId={staffId}
            position={position}
            minYear={minYear}
            maxYear={maxYear}
            onDone={() => setScreen('list')}
          />
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}

function EntryList({
  position,
  entries,
  onAdd,
  onClose,
}: {
  position: number;
  entries: ManualEntry[];
  onAdd: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Which row is asking «are you sure». Confirmed in the row rather than in a
  // second dialog: this one is already a dialog, and nesting two of them makes
  // them argue over the focus trap.
  const [confirming, setConfirming] = useState<string | null>(null);
  // Whether this position has alternatives worth telling apart — п.2 alone has.
  const named = positionChoices(position).length > 0;

  function remove(id: string) {
    startTransition(async () => {
      const result = await deleteKharakterystykaEntry(id);
      if (result && 'error' in result) {
        toast.error(result.error);
        return;
      }
      setConfirming(null);
      toast.success('Запис вилучено');
      router.refresh();
    });
  }

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>Записи до позиції {position}</AlertDialogTitle>
        <AlertDialogDescription>
          Один запис — одне досягнення. Якщо позиція вимагає п’ять, внесіть п’ять записів.
        </AlertDialogDescription>
      </AlertDialogHeader>

      {entries.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Записів ще немає</p>
      ) : (
        <ul className="max-h-72 space-y-1.5 overflow-y-auto">
          {entries.map((entry) => (
            <li key={entry.id} className="rounded-md border px-3 py-2 text-xs">
              {confirming === entry.id ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>Вилучити цей запис?</span>
                  <div className="flex shrink-0 gap-1.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7"
                      disabled={pending}
                      onClick={() => setConfirming(null)}
                    >
                      Скасувати
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="h-7"
                      disabled={pending}
                      onClick={() => remove(entry.id)}
                    >
                      Вилучити
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="whitespace-pre-line">{entry.text}</span>{' '}
                    <span className="text-muted-foreground tabular-nums">({entry.year})</span>
                    {named && (
                      <p className="mt-1 text-muted-foreground">
                        {alternativeLabel(entry.position, entry.group)}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setConfirming(entry.id)}
                    disabled={pending}
                    aria-label="Вилучити запис"
                    className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <AlertDialogFooter>
        <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
          Закрити
        </Button>
        <Button type="button" disabled={pending} onClick={onAdd}>
          <Plus className="size-4" />
          Додати запис
        </Button>
      </AlertDialogFooter>
    </>
  );
}

function EntryForm({
  staffId,
  position,
  minYear,
  maxYear,
  onDone,
}: {
  staffId: string;
  position: number;
  minYear: number;
  maxYear: number;
  /** Back to the list — after a save and after «Назад» alike */
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Empty for nineteen of the twenty positions: there is one way of meeting
  // them, so there is nothing to ask and the row lands on it by itself.
  const choices = positionChoices(position);
  // The position's own questions — п.15 asks for a школяр and an етап, п.20 for
  // a посада and a period. See `lib/kharakterystyka/position-evidence.ts`.
  const fields = positionEvidenceFields(position);
  // Does the form carry years of its own? Then the row's own «Рік» needs saying
  // apart from them.
  const asksForYears = fields.some((f) => f.kind === 'number' && /year/i.test(f.name));
  // Built once: rebuilding it on every render remounts the resolver and drops
  // what somebody has already typed.
  const [schema] = useState(() => positionFormSchema(position, minYear, maxYear));

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FieldValues>({
    resolver: standardSchemaResolver(schema as never) as unknown as Resolver<FieldValues>,
    defaultValues: {
      year: maxYear,
      group: choices[0]?.group ?? null,
      ...evidenceDefaults(fields),
    },
  });

  function onSubmit(values: FieldValues) {
    // The form is flat so the shared renderer can register each field under its
    // own name; the row's own two inputs are lifted back out here.
    const { year, group, ...evidence } = values;
    startTransition(async () => {
      const result = await addKharakterystykaEntry({
        staffId,
        position,
        year,
        group: group ?? null,
        evidence,
      });
      if (result && 'error' in result) {
        toast.error(result.error);
        return;
      }
      toast.success('Запис додано');
      onDone();
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <AlertDialogHeader>
        <AlertDialogTitle>Новий запис до позиції {position}</AlertDialogTitle>
        <AlertDialogDescription>
          Заповніть поля — текст документа складеться з них. Рік має бути в межах {minYear}–
          {maxYear}.
        </AlertDialogDescription>
      </AlertDialogHeader>

      {/* Two columns, because these forms are mostly short answers — a рік, a
          посада, a місце — and one field per row left the other half of the
          dialog empty beside every one of them (owner, 2026-09-01).

          A field spans both columns when it cannot read in half: a textarea, or
          a select whose options are whole sentences («керівництво школярем —
          призером учнівської олімпіади»). Matched with `:has()` so the shared
          renderer stays a plain list and needs no per-field span rule.

          `dense` lets a later short field backfill the gap a full-width one
          leaves behind, so п.1 puts Рік and Посилання on one row instead of
          stranding Рік beside nothing. */}
      <div
        className={cn(
          'grid max-h-[55vh] grid-cols-1 gap-4 overflow-y-auto pr-1',
          'sm:grid-flow-row-dense sm:grid-cols-2',
          // Descendant, not child: `contents` drops the renderer's wrapper out
          // of the LAYOUT, but it is still there in the DOM, so `>` matches
          // nothing past it.
          'sm:[&_[data-slot=field]:has(textarea)]:col-span-2',
          'sm:[&_[data-slot=field]:has([role=combobox])]:col-span-2'
        )}
      >
        {choices.length > 0 && (
          <FormField
            htmlFor="entry-group"
            label="Що саме підтверджує позицію"
            description="Кожен варіант має власну кількість, потрібну для виконання позиції"
            error={errors.group as { message?: string } | undefined}
          >
            <Controller
              name="group"
              control={control}
              render={({ field }) => (
                <Select
                  value={(field.value as string | null) ?? undefined}
                  onValueChange={field.onChange}
                  disabled={pending}
                >
                  <SelectTrigger id="entry-group" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {choices.map((choice) => (
                      <SelectItem key={choice.group} value={choice.group}>
                        {choice.label} — потрібно {choice.min}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </FormField>
        )}

        {/* The hint appears only where the form asks for years of its own —
            п.11 and п.20 both have «Рік початку / завершення», and there «Рік»
            alone does not say which year is meant. On the other fifteen it was
            a wrapped second line explaining the only year on screen. */}
        <FormField
          htmlFor="entry-year"
          label="Рік"
          description={asksForYears ? 'Рік, за який зараховується запис' : undefined}
          error={errors.year as { message?: string } | undefined}
        >
          <Input
            id="entry-year"
            type="number"
            min={minYear}
            max={maxYear}
            disabled={pending}
            {...register('year')}
          />
        </FormField>

        <EvidenceFields
          className="contents"
          fields={fields}
          register={register}
          control={control}
          errors={errors}
          disabled={pending}
        />

        <Preview fields={fields} control={control} className="sm:col-span-2" />
      </div>

      <AlertDialogFooter>
        <Button type="button" variant="outline" disabled={pending} onClick={onDone}>
          <ChevronLeft className="size-4" />
          Назад
        </Button>
        <Button type="submit" disabled={pending}>
          Зберегти
        </Button>
      </AlertDialogFooter>
    </form>
  );
}

/**
 * The sentence this row will print, as it is typed.
 *
 * The text is generated rather than written (owner, 2026-09-01), so every row
 * of one position reads the same way in a document read against the Ліцензійні
 * умови. Generated text nobody can see before saving is the kind of surprise
 * that gets a row deleted and retyped, so it is shown here.
 */
function Preview({
  fields,
  control,
  className,
}: {
  fields: readonly EvidenceField[];
  control: Control<FieldValues>;
  className?: string;
}) {
  const values = useWatch({ control });
  // Infinity, matching the action: the document prints every answered field.
  const text = summarizeEvidence(fields, values, Infinity);

  return (
    <div className={cn('rounded-md border border-dashed px-3 py-2', className)}>
      <p className="text-xs font-medium text-muted-foreground">У документі буде</p>
      <p className="mt-1 text-xs whitespace-pre-line">
        {text || <span className="text-muted-foreground">— заповніть поля вище</span>}
      </p>
    </div>
  );
}
