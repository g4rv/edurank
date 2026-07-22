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
  const taken = new Set(fields.map((f) => f.name));

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
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Поля форми</span>
        <Select
          value=""
          onValueChange={(kind) =>
            onChange([...fields, blankField(kind as EvidenceField['kind'], taken)])
          }
        >
          <SelectTrigger size="sm" className="w-48">
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
      </div>

      {fields.length === 0 && (
        <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          Полів немає. Показник можна подати без доказів — або додайте поле.
        </p>
      )}

      <div className="space-y-3">
        {fields.map((field, index) => (
          <FieldCard
            key={field.name}
            field={field}
            index={index}
            total={fields.length}
            scored={scoringNames.has(field.name)}
            onPatch={(changes) => patch(index, changes)}
            onRemove={() => onChange(fields.filter((_, i) => i !== index))}
            onMove={(delta) => move(index, delta)}
          />
        ))}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

function FieldCard({
  field,
  index,
  total,
  scored,
  onPatch,
  onRemove,
  onMove,
}: {
  field: EvidenceField;
  index: number;
  total: number;
  scored: boolean;
  onPatch: (changes: Partial<EvidenceField>) => void;
  onRemove: () => void;
  onMove: (delta: number) => void;
}) {
  return (
    <div className={cn('rounded-lg border p-3', scored && 'border-primary/40 bg-primary/[0.03]')}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full border px-2 py-0.5 text-muted-foreground">
              {FIELD_KIND_LABELS[field.kind]}
            </span>
            <code className="text-muted-foreground">{field.name}</code>
            {scored && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
                впливає на бали
              </span>
            )}
          </div>

          <Input
            value={field.label}
            onChange={(e) => onPatch({ label: e.target.value })}
            placeholder="Підпис поля"
            aria-label={`Підпис поля ${field.name}`}
          />

          <FieldSettings field={field} scored={scored} onPatch={onPatch} />
        </div>

        <div className="flex shrink-0 flex-col">
          <Button
            type="button"
            variant="ghost"
            size="icon"
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
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function FieldSettings({
  field,
  scored,
  onPatch,
}: {
  field: EvidenceField;
  scored: boolean;
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
              aria-label={`Мінімум для ${field.name}`}
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
              aria-label={`Пояснення для ${field.name}`}
            />
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
        <span className="text-xs text-muted-foreground">
          {scored ? 'Варіанти та їхні бали' : 'Варіанти'}
        </span>
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
