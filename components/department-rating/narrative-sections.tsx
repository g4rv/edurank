'use client';

import { useState } from 'react';
import { Controller, useFieldArray, type Control } from 'react-hook-form';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/aurora/ui/button';
import { Card } from '@/components/aurora/ui/card';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/aurora/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/aurora/ui/select';
import { Textarea } from '@/components/aurora/ui/textarea';
import { FormField } from '@/components/ui/form-field';
import { type ReportCounts } from '@/lib/department-rating/form-values';
import {
  DEVELOPMENT_BOXES,
  IMPACT_BOXES,
  IMPACT_KIND_LABEL,
  INITIATIVE_BOXES,
  NARRATIVE_TITLES,
  STUDY_BOXES,
} from '@/lib/department-rating/narrative-labels';
import { boxText, entrySummary, isBlank } from '@/lib/department-rating/narrative-summary';
import {
  EMPTY_NARRATIVE,
  IMPACT_KINDS,
  NARRATIVE_LIMITS,
  type DepartmentNarrative,
} from '@/validations/department-report';

type FormShape = { counts: ReportCounts; narrative: DepartmentNarrative };
/** A box holds text; 17.1's select holds its choice or null */
type Draft = Record<string, string | null>;

/** The select's «nothing chosen» — Radix refuses an empty-string item value */
const NO_KIND = '__none__';

/** One box of a popup. `choices` makes it a select (17.1) instead of a text box. */
interface BoxSpec {
  key: string;
  label: string;
  hint?: string;
  max?: number;
  choices?: readonly string[];
}

/** 17.3–17.6 carry the template's «до N знаків»; the rest take the general bound */
const IMPACT_LIMITS: Partial<Record<string, number>> = {
  results: NARRATIVE_LIMITS.results,
  role: NARRATIVE_LIMITS.role,
  description: NARRATIVE_LIMITS.impact,
  confirmations: NARRATIVE_LIMITS.confirmations,
};

const IMPACT_SPECS: BoxSpec[] = [
  { key: 'kind', label: IMPACT_KIND_LABEL, choices: IMPACT_KINDS },
  ...IMPACT_BOXES.map((b) => ({ ...b, max: IMPACT_LIMITS[b.key] })),
];

/**
 * Items 14–17 of the report — the half with no points.
 *
 * **Cards and popups, not open boxes** (owner, 2026-10-21: «the forms take way
 * too much space»). Each entry is a card naming it by its first filled box; the
 * pencil, «Додати …» or «Заповнити» opens a popup holding its boxes. The popup
 * edits a draft and hands it back with «Готово» — nothing reaches the report
 * until the page's own «Зберегти», the same way the diplomas work on a profile.
 *
 * Read-only (a декан, a closed year) prints the full text instead: a reader
 * came to read, and a popup would hide exactly that.
 */
export function NarrativeSections({
  control,
  year,
  editable,
  disabled,
  narrative,
}: {
  control: Control<FormShape>;
  year: number;
  editable: boolean;
  disabled: boolean;
  /** The saved narrative, for the read-only print */
  narrative: DepartmentNarrative;
}) {
  if (!editable) return <ReadOnlyNarrative narrative={narrative} year={year} />;
  return (
    <>
      <RepeatedSection
        control={control}
        name="narrative.initiative"
        title={`14. ${NARRATIVE_TITLES.initiative(year)}`}
        itemPrefix="14"
        specs={INITIATIVE_BOXES(year)}
        limit={NARRATIVE_LIMITS.initiativeRows}
        addLabel="Додати тему"
        disabled={disabled}
      />
      <RepeatedSection
        control={control}
        name="narrative.studies"
        title={`15. ${NARRATIVE_TITLES.studies}`}
        itemPrefix="15"
        specs={STUDY_BOXES}
        limit={NARRATIVE_LIMITS.studies}
        addLabel="Додати дослідження"
        disabled={disabled}
      />
      <SingleSection
        control={control}
        name="narrative.development"
        title={`16. ${NARRATIVE_TITLES.development}`}
        specs={DEVELOPMENT_BOXES}
        empty={EMPTY_NARRATIVE.development}
        disabled={disabled}
      />
      <SingleSection
        control={control}
        name="narrative.impact"
        title={`17. ${NARRATIVE_TITLES.impact}`}
        specs={IMPACT_SPECS}
        empty={EMPTY_NARRATIVE.impact}
        disabled={disabled}
      />
    </>
  );
}

/** Items 14 and 15: a list of entries, up to `limit` */
function RepeatedSection({
  control,
  name,
  title,
  itemPrefix,
  specs,
  limit,
  addLabel,
  disabled,
}: {
  control: Control<FormShape>;
  name: 'narrative.initiative' | 'narrative.studies';
  title: string;
  itemPrefix: string;
  specs: BoxSpec[];
  limit: number;
  addLabel: string;
  disabled: boolean;
}) {
  const { fields, append, update, remove } = useFieldArray({ control, name });
  const [dialog, setDialog] = useState<{ index: number | null; draft: Draft } | null>(null);
  const blankDraft = () => Object.fromEntries(specs.map((s) => [s.key, ''])) as Draft;

  return (
    <Card title={title}>
      <div className="space-y-3">
        {fields.length === 0 && <p className="text-sm text-muted-foreground">Ще не додано</p>}
        {fields.map((entry, index) => {
          const draft = pick(entry as unknown as Draft, specs);
          return (
            <EntryCard
              key={entry.id}
              number={`${itemPrefix}.${index + 1}`}
              summary={entrySummary(draft, specs)}
              disabled={disabled}
              onEdit={() => setDialog({ index, draft })}
              onRemove={() => remove(index)}
            />
          );
        })}
        {fields.length < limit && (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={disabled}
            onClick={() => setDialog({ index: null, draft: blankDraft() })}
          >
            <Plus className="size-4" />
            {addLabel}
          </Button>
        )}
      </div>

      <EntryDialog
        state={
          dialog && {
            title:
              dialog.index === null ? addLabel : `Редагувати ${itemPrefix}.${dialog.index + 1}`,
            adding: dialog.index === null,
            draft: dialog.draft,
          }
        }
        specs={specs}
        onClose={() => setDialog(null)}
        onDone={(draft) => {
          // A popup closed with nothing typed adds nothing
          if (dialog?.index === null && isBlank(draft)) {
            setDialog(null);
            return;
          }
          const value = draft as never;
          if (dialog?.index === null) append(value);
          else if (dialog) update(dialog.index, value);
          setDialog(null);
        }}
      />
    </Card>
  );
}

/** Items 16 and 17: one block each, filled or not */
function SingleSection({
  control,
  name,
  title,
  specs,
  empty,
  disabled,
}: {
  control: Control<FormShape>;
  name: 'narrative.development' | 'narrative.impact';
  title: string;
  specs: BoxSpec[];
  empty: Draft;
  disabled: boolean;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => {
        const value = pick(field.value as unknown as Draft, specs);
        const filled = !isBlank(value);
        return (
          <Card title={title}>
            <div className="space-y-3">
              {filled ? (
                <EntryCard
                  summary={entrySummary(value, specs)}
                  disabled={disabled}
                  onEdit={() => setDraft(value)}
                  onRemove={() => field.onChange({ ...empty })}
                  removeLabel="Очистити"
                />
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={disabled}
                  onClick={() => setDraft({ ...empty })}
                >
                  <Plus className="size-4" />
                  Заповнити
                </Button>
              )}
            </div>
            <EntryDialog
              state={draft && { title, adding: !filled, draft }}
              specs={specs}
              onClose={() => setDraft(null)}
              onDone={(next) => {
                field.onChange({ ...empty, ...next });
                setDraft(null);
              }}
            />
          </Card>
        );
      }}
    />
  );
}

/**
 * One entry as a card: its first filled box as the title, and how many of its
 * boxes are filled. A destructive bin, red at rest (§3 of docs/aurora.md).
 */
function EntryCard({
  number,
  summary,
  disabled,
  onEdit,
  onRemove,
  removeLabel = 'Прибрати',
}: {
  number?: string;
  summary: { title: string | null; filled: number; total: number };
  disabled: boolean;
  onEdit: () => void;
  onRemove: () => void;
  removeLabel?: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border bg-muted/30 px-4 py-3">
      {number && <span className="pt-px text-sm font-semibold tabular-nums">{number}</span>}
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 font-medium">{summary.title ?? '—'}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Заповнено {summary.filled} з {summary.total}
        </p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={number ? `Редагувати ${number}` : 'Редагувати'}
        disabled={disabled}
        onClick={onEdit}
      >
        <Pencil className="size-4" />
      </Button>
      <Button
        type="button"
        variant="destructive"
        size="icon-sm"
        aria-label={number ? `${removeLabel} ${number}` : removeLabel}
        disabled={disabled}
        onClick={onRemove}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

/**
 * The boxes of one entry, in a popup. Edits a LOCAL draft: «Готово» hands it
 * back, Скасувати leaves the card as it was. Not a nested `<form>` — it renders
 * in a portal and its buttons are `type="button"`.
 */
function EntryDialog({
  state,
  specs,
  onClose,
  onDone,
}: {
  state: { title: string; adding: boolean; draft: Draft } | null;
  specs: BoxSpec[];
  onClose: () => void;
  onDone: (draft: Draft) => void;
}) {
  return (
    <Dialog open={state !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-2xl">
        {/* Mounted only while open, so each visit starts from the card's own text */}
        {state && <EntryDialogForm state={state} specs={specs} onClose={onClose} onDone={onDone} />}
      </DialogContent>
    </Dialog>
  );
}

function EntryDialogForm({
  state,
  specs,
  onClose,
  onDone,
}: {
  state: { title: string; adding: boolean; draft: Draft };
  specs: BoxSpec[];
  onClose: () => void;
  onDone: (draft: Draft) => void;
}) {
  const [draft, setDraft] = useState<Draft>(state.draft);
  const set = (key: string, value: string | null) => setDraft((d) => ({ ...d, [key]: value }));

  return (
    <>
      <DialogHeader>
        <DialogTitle>{state.title}</DialogTitle>
        <DialogDescription>
          Усі поля необов’язкові. Зміни збережуться кнопкою «Зберегти» на сторінці.
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
        <div className="flex flex-col gap-4">
          {specs.map((spec) => {
            const id = `narrative-${spec.key}`;
            if (spec.choices) {
              return (
                <FormField key={spec.key} label={spec.label} htmlFor={id} description={spec.hint}>
                  <Select
                    value={draft[spec.key] ?? NO_KIND}
                    onValueChange={(v) => set(spec.key, v === NO_KIND ? null : v)}
                  >
                    <SelectTrigger id={id} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_KIND}>—</SelectItem>
                      {spec.choices.map((choice) => (
                        <SelectItem key={choice} value={choice}>
                          {choice}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
              );
            }
            const value = typeof draft[spec.key] === 'string' ? (draft[spec.key] as string) : '';
            const max = spec.max ?? NARRATIVE_LIMITS.text;
            return (
              <FormField key={spec.key} label={spec.label} htmlFor={id} description={spec.hint}>
                <Textarea
                  id={id}
                  value={value}
                  maxLength={max}
                  rows={3}
                  onChange={(e) => set(spec.key, e.target.value)}
                />
                {(spec.max !== undefined || value.length > max * 0.8) && (
                  <p className="mt-1 text-right text-xs text-muted-foreground tabular-nums">
                    {value.length} / {max}
                  </p>
                )}
              </FormField>
            );
          })}
        </div>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Скасувати
        </Button>
        <Button type="button" onClick={() => onDone(draft)}>
          {state.adding ? 'Додати' : 'Готово'}
        </Button>
      </DialogFooter>
    </>
  );
}

/** Only the keys this section knows — RHF adds its own `id` to array rows */
function pick(entry: Draft | undefined, specs: BoxSpec[]): Draft {
  return Object.fromEntries(specs.map((s) => [s.key, entry?.[s.key] ?? (s.choices ? null : '')]));
}

/** The whole narrative printed as text — for a декан and a closed year */
function ReadOnlyNarrative({ narrative, year }: { narrative: DepartmentNarrative; year: number }) {
  const block = (specs: BoxSpec[], entry: Draft) => (
    <div className="space-y-3">
      {specs.map((s) => (
        <div key={s.key} className="space-y-0.5">
          <div className="text-sm font-medium">{s.label}</div>
          <p className="text-sm whitespace-pre-wrap">{boxText(entry[s.key]) || '—'}</p>
        </div>
      ))}
    </div>
  );
  const list = (prefix: string, specs: BoxSpec[], entries: Draft[]) =>
    entries.length === 0 ? (
      <p className="text-sm text-muted-foreground">—</p>
    ) : (
      <div className="space-y-6">
        {entries.map((entry, i) => (
          <div key={i} className="space-y-3">
            <div className="border-b pb-1.5 text-base font-semibold">{`${prefix}.${i + 1}`}</div>
            {block(specs, entry)}
          </div>
        ))}
      </div>
    );

  return (
    <>
      <Card title={`14. ${NARRATIVE_TITLES.initiative(year)}`}>
        {list('14', INITIATIVE_BOXES(year), narrative.initiative as unknown as Draft[])}
      </Card>
      <Card title={`15. ${NARRATIVE_TITLES.studies}`}>
        {list('15', STUDY_BOXES, narrative.studies as unknown as Draft[])}
      </Card>
      <Card title={`16. ${NARRATIVE_TITLES.development}`}>
        {block(DEVELOPMENT_BOXES, narrative.development as unknown as Draft)}
      </Card>
      <Card title={`17. ${NARRATIVE_TITLES.impact}`}>
        {block(IMPACT_SPECS, narrative.impact as unknown as Draft)}
      </Card>
    </>
  );
}
