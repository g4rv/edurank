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
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/aurora/ui/dialog';
import { Button } from '@/components/aurora/ui/button';
import { Input } from '@/components/aurora/ui/input';
import { FormField } from '@/components/ui/form-field';
import { EvidenceFields } from '@/components/rating/evidence-fields';
import { EvidenceText } from './evidence-text';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/aurora/ui/select';
import {
  addKharakterystykaEntry,
  deleteKharakterystykaEntry,
} from '@/app/(dashboard)/staff/[id]/(record)/kharakterystyka/actions';
import {
  alternativeLabel,
  licencePosition,
  positionChoices,
  requiredEntries,
} from '@/lib/kharakterystyka/positions';
import { positionEvidenceFields } from '@/lib/kharakterystyka/position-evidence';
import { evidenceDefaults, summarizeEvidence } from '@/lib/rating/evidence-fields';
import type { EvidenceField } from '@/lib/rating/evidence-fields';
import { cn } from '@/lib/utils';
import { positionFormSchema } from '@/validations/kharakterystyka';
import { RequiredFields } from '@/components/ui/required-fields';

export interface ManualEntry {
  id: string;
  position: number;
  group: string | null;
  year: number;
  text: string;
  /** The account that typed it. Comparable to a staff id — see `selfId`. */
  createdBy: string;
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
  selfId,
}: {
  staffId: string;
  position: number;
  entries: ManualEntry[];
  minYear: number;
  maxYear: number;
  /** Whose document this is; a row `createdBy` this id was typed by them. */
  selfId?: string;
}) {
  const [open, setOpen] = useState(false);
  const typed = entries.length > 0;

  return (
    // `mt-3`, not `mt-2`. At two the trigger sat the same distance from the last
    // evidence line as those lines sit from each other, so it read as one more
    // of them rather than as the cell's action.
    <div className="mt-3">
      {/* **`outline`, not `ghost`** (owner, 2026-09-22). As a ghost at
          `text-xs text-muted-foreground` this was lighter than the evidence
          above it and the same weight as the «(2024)» after each line — the
          one interactive thing on the page, drawn as metadata. People had to be
          told it existed.

          An edge is what says «control», and `outline` is the variant drawn for
          a solid card, which is what the table sits on. It stays monochrome at
          rest — §3's chrome rule, and there may be seventeen of these on screen
          at once — and picks up `--brand` on hover, the same way the breadcrumb
          does. */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5 hover:border-brand/45 hover:text-brand"
        onClick={() => setOpen(true)}
      >
        {/* **The verb, until there is something to list.** «Записи вручну» on
            an empty position names a list that does not exist yet and says
            nothing about what pressing it does. Once rows exist the noun is
            right, because the dialog then genuinely opens on them. */}
        {typed ? <PencilLine className="text-muted-foreground" /> : <Plus />}
        {typed ? 'Записи вручну' : 'Додати запис'}
        {/* A counter, not «· 2». The middot ran into the label at the same
            weight and colour, so the number read as part of the words. */}
        {typed && (
          <span className="-mr-0.5 ml-0.5 rounded bg-foreground/8 px-1.5 py-px text-[0.7rem] font-semibold tabular-nums dark:bg-white/12">
            {entries.length}
          </span>
        )}
      </Button>

      <EntriesDialog
        open={open}
        onOpenChange={setOpen}
        staffId={staffId}
        position={position}
        entries={entries}
        minYear={minYear}
        maxYear={maxYear}
        selfId={selfId}
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
  selfId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staffId: string;
  position: number;
  entries: ManualEntry[];
  minYear: number;
  maxYear: number;
  selfId?: string;
}) {
  const [screen, setScreen] = useState<'list' | 'form'>('list');

  function change(next: boolean) {
    // Reopening on the form somebody abandoned reads as a save that did not
    // happen. The dialog always opens on what the document actually holds.
    if (!next) setScreen('list');
    onOpenChange(next);
  }

  return (
    // **`Dialog`, not `AlertDialog`** (owner, 2026-09-22). An alert dialog is
    // for a decision you must answer — it deliberately ignores a click outside
    // and carries no ×, so the only way out is one of its buttons. This is not
    // that. It is a panel you open to read what is already typed and maybe add
    // one more, and it was wearing an alert's manners: no ×, no Esc-to-dismiss
    // by click-away, and a «Закрити» button taking footer space from the one
    // action. `Dialog` brings the ×, the click-away and the Esc for free.
    <Dialog open={open} onOpenChange={change}>
      <DialogContent
        // ...except while a form is half-typed. Walking away from a LIST costs
        // nothing; walking away from six filled boxes costs them. This is the
        // rule, not an exception to it: a dialog holding unsaved input does not
        // vanish on a stray click. The × and Esc still work, because those are
        // deliberate.
        onInteractOutside={(e) => {
          if (screen === 'form') e.preventDefault();
        }}
      >
        {screen === 'list' ? (
          <EntryList
            position={position}
            entries={entries}
            selfId={selfId}
            onAdd={() => setScreen('form')}
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
      </DialogContent>
    </Dialog>
  );
}

/**
 * The dialog's heading: which position this is, and what it literally asks for.
 *
 * The п.38 wording IS the description of this dialog, so it sits in
 * `DialogDescription` rather than in a grey box under the header. It used to be
 * third on screen, under a title of «Записи до позиції 1» and a generic note,
 * which put the only sentence identifying the position last.
 *
 * **Capped and scrollable rather than clamped.** п.15's wording runs to four
 * hundred characters, and cutting a licence requirement mid-sentence is how
 * somebody claims the wrong thing. It gets a ceiling so it cannot swamp the
 * panel, and the rest is a scroll away.
 */
function PositionHeader({ position, title }: { position: number; title: string }) {
  const def = licencePosition(position);
  return (
    <DialogHeader>
      <DialogTitle>{title}</DialogTitle>
      {def && (
        // 14px, not 12 (owner, 2026-09-14). This is the requirement somebody
        // reads to decide whether their achievement qualifies — the one
        // paragraph here that has to be read rather than glanced at.
        <DialogDescription className="max-h-32 overflow-y-auto text-sm">
          {def.title}
        </DialogDescription>
      )}
    </DialogHeader>
  );
}

/**
 * What to enter, and how many — the note that replaced «Якщо позиція вимагає
 * п’ять, внесіть п’ять записів».
 *
 * That sentence was a rule with the number left out, printed identically on all
 * seventeen positions, so the reader had to find the real figure somewhere else
 * — or count the law's wording themselves. `requiredEntries` knows it.
 *
 * п.2 is the one that cannot be answered here: a патент на винахід counts alone
 * while деклараційні and свідоцтва need five each, so it points at the form,
 * where the choice carries its own «потрібно N».
 */
function PositionDemand({ position }: { position: number }) {
  const def = licencePosition(position);
  const need = requiredEntries(position);

  const demand =
    need === null
      ? 'Кожен варіант має власну кількість — оберіть його під час додавання.'
      : need === 1
        ? 'Для виконання позиції достатньо одного запису.'
        : `Для виконання позиції потрібно ${need} записів.`;

  return (
    <div className="space-y-1">
      <p className="text-sm text-foreground-soft">Один запис — одне досягнення. {demand}</p>
      {/* The position's own caveat — п.13's «показник 2.3 враховує від 30
          годин, а ліцензійна умова вимагає 50». It used to ride under
          the wording in the grey box; it is advice about filling the form, so
          it belongs with the rest of the advice. */}
      {def?.note && <p className="text-xs text-muted-foreground">{def.note}</p>}
    </div>
  );
}

function EntryList({
  position,
  entries,
  selfId,
  onAdd,
}: {
  position: number;
  entries: ManualEntry[];
  selfId?: string;
  onAdd: () => void;
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
      {/* **The position names itself, then says what it wants** (owner,
          2026-09-22). It read «Записи до позиції 1» — a number and no
          subject — then a generic note, and only THEN the requirement itself,
          in a grey box below both. The one sentence that says what п.1 is
          came third.

          It is the description now, where a description belongs, and the
          generic note has become a specific one under it. */}
      <PositionHeader position={position} title={`Пункт ${position}`} />

      <DialogBody className="space-y-3">
        <PositionDemand position={position} />

        {entries.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Записів ще немає</p>
        ) : (
          <ul className="space-y-1.5">
            {entries.map((entry) => (
              // `text-sm`, not `text-xs` (owner, 2026-09-22). §4 puts body text at
              // 14px and keeps 12 for meta and counts — and this is neither. It is
              // the evidence sentence itself, the thing the licence document
              // prints, read here to decide whether to keep it. The two lines
              // under it stay quiet on COLOUR rather than on size.
              <li key={entry.id} className="rounded-md border px-3 py-2 text-sm">
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
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      {/* The same cut-and-link treatment as a derived entry: a
                        typed row sits in the same 42% column and is the one
                        somebody is most likely to have pasted a URL into. */}
                      <EvidenceText text={entry.text} />{' '}
                      <span className="text-muted-foreground tabular-nums">({entry.year})</span>
                      {named && (
                        <p className="mt-1 text-muted-foreground">
                          {alternativeLabel(entry.position, entry.group)}
                        </p>
                      )}
                      {/* **Who wrote this line** (owner, 2026-09-14). Since an НПП
                        can type п.15 and п.20 about themselves, a reader — an
                        administrator, or whoever defends the licence file — has
                        to be able to tell a self-declared line from one an
                        administrator entered. The row already stores it; the
                        account id IS the staff id, so this needs no lookup. */}
                      <p className="mt-1 text-muted-foreground">
                        {selfId && entry.createdBy === selfId
                          ? 'Внесено власноруч'
                          : 'Внесено адміністратором'}
                      </p>
                    </div>
                    {/* **The app's one delete control** — `variant="destructive"`
                      at icon size, the same one the факультет / кафедра /
                      відділ trio, `delete-activity-button`,
                      `delete-plan-row-button` and `delete-record-button` wear.

                      §3 asks for red AT REST, and as of 2026-09-22 that means
                      the TINT too. The hand-rolled button this replaced was
                      `text-muted-foreground` — neutral until you point at it,
                      which §3 refuses — and the `ghost` + `text-error` version
                      in between kept `ghost`'s grey `hover:bg-foreground/6`. */}
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon-sm"
                      onClick={() => setConfirming(entry.id)}
                      disabled={pending}
                      aria-label="Вилучити запис"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </DialogBody>

      {/* **One action, full width** (owner, 2026-09-22). «Закрити» is gone: the
          ×, Esc and a click outside all do it, and a button whose only job is
          to undo opening the dialog was taking half the footer from the thing
          people came to press. */}
      <DialogFooter>
        <Button type="button" className="w-full" disabled={pending} onClick={onAdd}>
          <Plus className="size-4" />
          Додати запис
        </Button>
      </DialogFooter>
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
    <RequiredFields schema={schema}>
      <form noValidate onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
        {/* The same heading as the list, so moving between the two screens does
            not change what you are looking at — only what you are doing to it. */}
        <PositionHeader position={position} title={`Пункт ${position} — новий запис`} />

        <DialogBody>
          <p className="mb-4 text-sm text-foreground-soft">
            Заповніть поля — текст документа складеться з них. Рік має бути в межах {minYear}–
            {maxYear}.
          </p>

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
              // `-mx-1 px-1`, not `pr-1`. `overflow-y-auto` clips BOTH axes, and a
              // focused field draws a 3px ring outside its border box — so the
              // right ring had 4px of room and the LEFT one was sliced off flush.
              // The negative margin cancels the padding, so the fields stay exactly
              // where they were and only the ring gains somewhere to land.
              // No `max-h`/`overflow` of its own any more: `DialogBody` is the
              // scroller now, and two nested ones fight over the wheel.
              '-mx-1 grid grid-cols-1 gap-4 px-1',
              'sm:grid-flow-row-dense sm:grid-cols-2',
              // Descendant, not child: `contents` drops the renderer's wrapper out
              // of the LAYOUT, but it is still there in the DOM, so `>` matches
              // nothing past it.
              // `:not([data-span])` — a field that states its own width wins.
              // Without it these descendant selectors outrank the field's own
              // class and every select goes full-width again, which is what kept
              // «Етап» and «Призове місце» off one line.
              'sm:[&_[data-slot=field]:not([data-span]):has(textarea)]:col-span-2',
              'sm:[&_[data-slot=field]:not([data-span]):has([role=combobox])]:col-span-2',
              // **Fields align at the TOP, not the bottom.**
              //
              // Bottom-aligning was tried (2026-09-14) so that a one-line label
              // beside a two-line one still put their inputs on one line. It broke
              // the moment the form was submitted empty: an error message is part
              // of the cell, so «Етап» growing by one red line pushed «Призове
              // місце» down beside it — misaligned exactly when a person is
              // reading the form most carefully.
              //
              // The reorder that followed removed the reason for it: every pair
              // that now shares a row has two short labels. If a position ever
              // needs a tall label beside a short one, give it `span: 2` rather
              // than bringing this back — alignment that depends on nothing going
              // wrong is not alignment.
              'sm:[&_[data-slot=field]]:self-start'
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

            <EvidenceFields
              className="contents"
              fields={fields}
              register={register}
              control={control}
              errors={errors}
              disabled={pending}
            />

            {/* **Last, not first** (owner, 2026-09-14). It is the only answer on
              the form that arrives already filled in, so it belongs where the
              eye ends rather than where it starts — the fields somebody has to
              think about come first. */}
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

            <Preview fields={fields} control={control} className="sm:col-span-2" />
          </div>
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={onDone}>
            <ChevronLeft className="size-4" />
            Назад
          </Button>
          <Button type="submit" disabled={pending}>
            Зберегти
          </Button>
        </DialogFooter>
      </form>
    </RequiredFields>
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
      <p className="text-xs font-medium text-muted-foreground">В записі буде</p>
      <p className="mt-1 text-xs whitespace-pre-line">
        {text || <span className="text-muted-foreground">— заповніть поля вище</span>}
      </p>
    </div>
  );
}
