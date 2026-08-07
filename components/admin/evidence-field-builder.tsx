'use client';

import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { EvidenceField } from '@/lib/rating/evidence-fields';
import type { ScoringSpec } from '@/lib/rating/scoring';
import { scoringFieldNames } from '@/validations/activity-type-spec';
import { SCOPUS_OR_WOS_HOSTS } from '@/lib/link-hosts';
import { cn } from '@/lib/utils';

// The form definition editor. Field kinds are a fixed menu — each one is
// something the renderer and the Zod generator already understand — but which
// fields exist, what they are called and (for selects) what they are worth is
// entirely the admin's to decide.

const FIELD_KIND_LABELS: Record<EvidenceField['kind'], string> = {
  text: 'Текст',
  number: 'Число',
  url: 'Посилання',
  date: 'Дата',
  checkbox: 'Прапорець',
  select: 'Список вибору',
  isbn: 'ISBN',
  doi: 'DOI',
};

const ADDABLE_KINDS: EvidenceField['kind'][] = [
  'text',
  'number',
  'url',
  'date',
  'select',
  'checkbox',
  'isbn',
  'doi',
];

/** A machine name from a label: «Назва проєкту» → project_title-ish fallback */
function nextFieldName(kind: string, taken: Set<string>): string {
  let i = 1;
  let candidate = `${kind}_${i}`;
  while (taken.has(candidate)) {
    i += 1;
    candidate = `${kind}_${i}`;
  }
  return candidate;
}

function blankField(kind: EvidenceField['kind'], taken: Set<string>): EvidenceField {
  const name = nextFieldName(kind, taken);
  const label = FIELD_KIND_LABELS[kind];
  switch (kind) {
    case 'select':
      return {
        kind,
        name,
        label,
        options: [{ value: 'option_1', label: 'Варіант 1' }],
      };
    case 'number':
      return { kind, name, label, min: 0 };
    default:
      return { kind, name, label } as EvidenceField;
  }
}

/** Lives in the section header next to «Поля форми», so it stays in reach */
export function AddFieldSelect({
  fields,
  onChange,
}: {
  fields: EvidenceField[];
  onChange: (fields: EvidenceField[]) => void;
}) {
  const taken = new Set(fields.map((f) => f.name));

  return (
    <Select
      value=""
      onValueChange={(kind) =>
        onChange([...fields, blankField(kind as EvidenceField['kind'], taken)])
      }
    >
      <SelectTrigger size="sm" className="w-44 shrink-0">
        <SelectValue placeholder="Додати поле…" />
      </SelectTrigger>
      <SelectContent align="end">
        {ADDABLE_KINDS.map((kind) => (
          <SelectItem key={kind} value={kind}>
            {FIELD_KIND_LABELS[kind]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

interface EvidenceFieldBuilderProps {
  fields: EvidenceField[];
  scoring: ScoringSpec;
  onChange: (fields: EvidenceField[]) => void;
  error?: string;
}

export function EvidenceFieldBuilder({
  fields,
  scoring,
  onChange,
  error,
}: EvidenceFieldBuilderProps) {
  const scoringNames = new Set(scoringFieldNames(scoring));

  // CHECK_SUM splits the `mode` select's points across the checkboxes, so each
  // box needs one input per mode option. Read off the live fields, so adding a
  // mode immediately asks for its column.
  const modeField = fields.find((f) => f.kind === 'select' && f.name === 'mode');
  const modeOptions =
    scoring.kind === 'CHECK_SUM' && modeField?.kind === 'select'
      ? modeField.options.map((o) => ({ value: o.value, label: o.label }))
      : [];

  function patch(index: number, changes: Partial<EvidenceField>) {
    onChange(fields.map((f, i) => (i === index ? ({ ...f, ...changes } as EvidenceField) : f)));
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= fields.length) return;
    const next = [...fields];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  return (
    <div className="space-y-3">
      {fields.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          Полів немає. Показник можна подати без доказів — або додайте поле.
        </p>
      ) : (
        <div className="space-y-2">
          {fields.map((field, index) => (
            <FieldCard
              key={field.name}
              field={field}
              index={index}
              total={fields.length}
              scored={scoringNames.has(field.name)}
              modeOptions={modeOptions}
              onPatch={(changes) => patch(index, changes)}
              onRemove={() => onChange(fields.filter((_, i) => i !== index))}
              onMove={(delta) => move(index, delta)}
            />
          ))}
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}
    </div>
  );
}

function FieldCard({
  field,
  index,
  total,
  scored,
  modeOptions,
  onPatch,
  onRemove,
  onMove,
}: {
  field: EvidenceField;
  index: number;
  total: number;
  scored: boolean;
  modeOptions: { value: string; label: string }[];
  onPatch: (changes: Partial<EvidenceField>) => void;
  onRemove: () => void;
  onMove: (delta: number) => void;
}) {
  return (
    <div
      className={cn('rounded-lg border bg-card p-3', scored && 'border-primary/40 bg-primary/5')}
    >
      {/* The card's own controls sit in its header, so they cannot be mistaken
          for controls of whatever the settings below happen to render. */}
      <div className="mb-2 flex items-center gap-2 text-xs">
        <span className="shrink-0 rounded-full border px-2 py-0.5 whitespace-nowrap text-muted-foreground">
          {FIELD_KIND_LABELS[field.kind]}
        </span>
        {scored && (
          <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
            впливає на бали
          </span>
        )}

        <div className="ml-auto flex shrink-0 items-center">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            aria-label="Вище"
          >
            <ChevronUp className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            aria-label="Нижче"
          >
            <ChevronDown className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRemove}
            // A scoring field cannot go: the rule reads it by name
            disabled={scored}
            aria-label={scored ? 'Поле потрібне для нарахування балів' : 'Прибрати поле'}
            className="size-7 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Input
          value={field.label}
          onChange={(e) => onPatch({ label: e.target.value })}
          placeholder="Підпис поля"
          aria-label={`Підпис поля ${index + 1}`}
        />

        <FieldSettings field={field} scored={scored} modeOptions={modeOptions} onPatch={onPatch} />
      </div>
    </div>
  );
}

function FieldSettings({
  field,
  scored,
  modeOptions,
  onPatch,
}: {
  field: EvidenceField;
  scored: boolean;
  modeOptions: { value: string; label: string }[];
  onPatch: (changes: Partial<EvidenceField>) => void;
}) {
  const optionalToggle = 'optional' in field && (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <Switch
        checked={field.optional === true}
        onCheckedChange={(v) => onPatch({ optional: v } as Partial<EvidenceField>)}
        // The rule needs a value here, so it cannot be left blank
        disabled={scored && field.name !== 'coAuthors'}
      />
      <span>Необов&apos;язкове</span>
    </label>
  );

  switch (field.kind) {
    case 'text':
      return (
        <div className="flex flex-wrap gap-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Switch
              checked={field.multiline === true}
              onCheckedChange={(v) => onPatch({ multiline: v } as Partial<EvidenceField>)}
            />
            <span>Багато рядків</span>
          </label>
          {optionalToggle}
        </div>
      );

    case 'number':
      return (
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Мінімум</span>
            <Input
              type="number"
              step="any"
              className="w-24"
              value={field.min ?? 0}
              onChange={(e) =>
                onPatch({ min: Number(e.target.value) || 0 } as Partial<EvidenceField>)
              }
              aria-label={`Мінімум для «${field.label}»`}
            />
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Switch
              checked={field.int === true}
              onCheckedChange={(v) => onPatch({ int: v } as Partial<EvidenceField>)}
            />
            <span>Ціле число</span>
          </label>
          {optionalToggle}
        </div>
      );

    case 'url':
      return (
        <div className="flex flex-wrap gap-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Switch
              checked={!!field.hosts}
              onCheckedChange={(v) =>
                onPatch(
                  (v
                    ? {
                        hosts: [...SCOPUS_OR_WOS_HOSTS],
                        hostsError: 'Очікується посилання на Scopus або Web of Science',
                      }
                    : { hosts: undefined, hostsError: undefined }) as Partial<EvidenceField>
                )
              }
            />
            <span>Лише Scopus / Web of Science</span>
          </label>
          {optionalToggle}
        </div>
      );

    case 'checkbox':
      return (
        <div className="space-y-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Switch
              checked={field.mustBeTrue === true}
              onCheckedChange={(v) => onPatch({ mustBeTrue: v } as Partial<EvidenceField>)}
            />
            <span>Обов&apos;язково підтвердити</span>
          </label>
          {field.mustBeTrue && (
            <Input
              value={field.requiredError ?? ''}
              onChange={(e) =>
                onPatch({ requiredError: e.target.value || undefined } as Partial<EvidenceField>)
              }
              placeholder="Пояснення, чому це обов'язково"
              aria-label={`Пояснення для «${field.label}»`}
            />
          )}
          {modeOptions.length > 0 && (
            <div className="space-y-1.5 rounded-md border border-dashed p-2">
              <p className="text-xs text-muted-foreground">
                Бали за цей пункт. Разом по всіх пунктах має вийти максимум виду роботи.
              </p>
              {modeOptions.map((o) => (
                <label key={o.value} className="flex items-center gap-2 text-sm">
                  <span className="min-w-32 text-muted-foreground">{o.label}</span>
                  <Input
                    type="number"
                    inputMode="numeric"
                    className="h-8 w-24"
                    value={field.points?.[o.value] ?? ''}
                    onChange={(e) => {
                      const next = { ...(field.points ?? {}) };
                      if (e.target.value === '') delete next[o.value];
                      else next[o.value] = Number(e.target.value);
                      onPatch({
                        points: Object.keys(next).length > 0 ? next : undefined,
                      } as Partial<EvidenceField>);
                    }}
                    aria-label={`Бали «${field.label}» для «${o.label}»`}
                  />
                </label>
              ))}
            </div>
          )}
        </div>
      );

    case 'select':
      return <OptionsEditor field={field} scored={scored} onPatch={onPatch} />;

    default:
      return optionalToggle ? <div className="flex gap-4">{optionalToggle}</div> : null;
  }
}

function OptionsEditor({
  field,
  scored,
  onPatch,
}: {
  field: Extract<EvidenceField, { kind: 'select' }>;
  scored: boolean;
  onPatch: (changes: Partial<EvidenceField>) => void;
}) {
  const options = field.options;

  function set(next: typeof options) {
    onPatch({ options: next } as Partial<EvidenceField>);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Варіанти</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            const taken = new Set(options.map((o) => o.value));
            let i = options.length + 1;
            while (taken.has(`option_${i}`)) i += 1;
            set([
              ...options,
              { value: `option_${i}`, label: `Варіант ${i}`, ...(scored ? { points: 0 } : {}) },
            ]);
          }}
        >
          <Plus className="size-4" />
          Варіант
        </Button>
      </div>

      {/* Only worth a column header when there is a second column to name */}
      {scored && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex-1">Назва варіанта</span>
          <span className="w-28 shrink-0">Бали</span>
          <span className="size-8 shrink-0" aria-hidden />
        </div>
      )}

      {options.map((option, i) => (
        <div key={option.value} className="flex items-center gap-2">
          <Input
            value={option.label}
            onChange={(e) =>
              set(options.map((o, j) => (i === j ? { ...o, label: e.target.value } : o)))
            }
            placeholder="Назва варіанта"
            aria-label={`Назва варіанта ${i + 1}`}
          />
          {scored && (
            <Input
              type="number"
              step="any"
              min="0"
              className="w-28 shrink-0"
              value={option.points ?? 0}
              onChange={(e) =>
                set(
                  options.map((o, j) =>
                    i === j ? { ...o, points: Number(e.target.value) || 0 } : o
                  )
                )
              }
              aria-label={`Бали за варіант ${i + 1}`}
            />
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => set(options.filter((_, j) => j !== i))}
            disabled={options.length === 1}
            aria-label={`Прибрати варіант ${i + 1}`}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}
