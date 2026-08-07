'use client';

import {
  Controller,
  useWatch,
  type Control,
  type FieldErrors,
  type FieldValues,
  type UseFormRegister,
} from 'react-hook-form';
import { cn } from '@/lib/utils';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { DoiInput } from '@/components/ui/doi-input';
import { IsbnInput } from '@/components/ui/isbn-input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { EvidenceField } from '@/lib/rating/evidence-fields';
import { MIN_EVIDENCE_YEAR } from '@/validations/activity-evidence';

const DATE_MIN = `${MIN_EVIDENCE_YEAR}-01-01`;
const DATE_MAX = `${new Date().getFullYear() + 1}-12-31`;

interface EvidenceFieldsProps {
  fields: readonly EvidenceField[];
  register: UseFormRegister<FieldValues>;
  control: Control<FieldValues>;
  errors: FieldErrors<FieldValues>;
  disabled?: boolean;
}

export type RenderItem =
  | { kind: 'single'; field: EvidenceField }
  | { kind: 'group'; title: string; fields: EvidenceField[] };

/** Folds consecutive checkboxes sharing a `group` title into one block */
export function toRenderItems(fields: readonly EvidenceField[]): RenderItem[] {
  const items: RenderItem[] = [];

  for (const field of fields) {
    const group = field.kind === 'checkbox' ? field.group : undefined;
    if (!group) {
      items.push({ kind: 'single', field });
      continue;
    }
    const last = items.at(-1);
    if (last?.kind === 'group' && last.title === group) last.fields.push(field);
    else items.push({ kind: 'group', title: group, fields: [field] });
  }

  return items;
}

/** Renders one activity type's evidence inputs from its field specs */
export function EvidenceFields({
  fields,
  register,
  control,
  errors,
  disabled,
}: EvidenceFieldsProps) {
  // A CHECK_SUM checkbox is worth a different amount per mode, so the « — N
  // балів» suffix has to follow the mode the person has actually chosen. Any
  // other rule has no `mode` field and this stays undefined, costing nothing.
  const mode = useWatch({ control, name: 'mode' });

  function pointsFor(f: Extract<EvidenceField, { kind: 'checkbox' }>): number | undefined {
    return typeof mode === 'string' ? f.points?.[mode] : undefined;
  }

  // When checkboxes divide the chosen option's points, that number is a ceiling
  // rather than an award — «Розроблення — 150 балів» would promise a total only
  // a fully-filled course earns.
  const scoredByCheckboxes = fields.some((f) => f.kind === 'checkbox' && f.points !== undefined);

  function renderField(f: EvidenceField) {
    const error = errors[f.name] as { message?: string } | undefined;

    switch (f.kind) {
      case 'text':
        return (
          <FormField key={f.name} htmlFor={f.name} label={f.label} error={error}>
            {f.multiline ? (
              <Textarea id={f.name} disabled={disabled} {...register(f.name)} />
            ) : (
              <Input id={f.name} disabled={disabled} {...register(f.name)} />
            )}
          </FormField>
        );

      case 'number':
        return (
          <FormField key={f.name} htmlFor={f.name} label={f.label} error={error}>
            <Input
              id={f.name}
              type="number"
              step={f.int ? 1 : 'any'}
              min={f.min}
              disabled={disabled}
              {...register(f.name)}
            />
          </FormField>
        );

      case 'url':
        return (
          <FormField key={f.name} htmlFor={f.name} label={f.label} error={error}>
            <Input
              id={f.name}
              type="url"
              // Host-restricted fields name that service, so the example is
              // one the field will actually accept
              placeholder="https://…"
              disabled={disabled}
              {...register(f.name)}
            />
          </FormField>
        );

      case 'isbn':
        return (
          <FormField key={f.name} htmlFor={f.name} label={f.label} error={error}>
            <IsbnInput id={f.name} disabled={disabled} {...register(f.name)} />
          </FormField>
        );

      case 'doi':
        return (
          <FormField key={f.name} htmlFor={f.name} label={f.label} error={error}>
            <DoiInput id={f.name} disabled={disabled} {...register(f.name)} />
          </FormField>
        );

      case 'date':
        return (
          <FormField key={f.name} htmlFor={f.name} label={f.label} error={error}>
            <Input
              id={f.name}
              type="date"
              min={DATE_MIN}
              max={DATE_MAX}
              disabled={disabled}
              {...register(f.name)}
            />
          </FormField>
        );

      case 'checkbox':
        return (
          <FormField key={f.name} error={error}>
            {checkboxRow(f, !!error)}
          </FormField>
        );

      case 'select':
        return (
          <FormField key={f.name} htmlFor={f.name} label={f.label} error={error}>
            <Controller
              name={f.name}
              control={control}
              render={({ field }) => (
                <Select
                  value={typeof field.value === 'string' ? field.value : ''}
                  onValueChange={field.onChange}
                  disabled={disabled}
                >
                  <SelectTrigger id={f.name} className="w-full" aria-invalid={!!error}>
                    <SelectValue placeholder="Оберіть…" />
                  </SelectTrigger>
                  <SelectContent>
                    {f.options.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                        {o.points === undefined
                          ? ''
                          : scoredByCheckboxes
                            ? ` — до ${o.points} балів`
                            : ` — ${o.points} балів`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </FormField>
        );
    }
  }

  /** The switch and its label; the error text is placed by the caller */
  function checkboxRow(f: Extract<EvidenceField, { kind: 'checkbox' }>, invalid: boolean) {
    const points = pointsFor(f);
    return (
      <Controller
        name={f.name}
        control={control}
        render={({ field }) => (
          <label
            className={cn(
              'flex cursor-pointer items-center gap-2.5 text-sm',
              invalid && 'text-destructive'
            )}
          >
            <Switch
              checked={field.value === true}
              onCheckedChange={field.onChange}
              disabled={disabled}
              aria-invalid={invalid}
            />
            <span>
              {f.label}
              {points !== undefined ? (
                <span className="text-muted-foreground"> — {points} балів</span>
              ) : null}
            </span>
          </label>
        )}
      />
    );
  }

  return (
    <div className="space-y-4">
      {toRenderItems(fields).map((item) => {
        if (item.kind === 'single') return renderField(item.field);

        // The set fails as one, so it gets one heading and one message; the
        // individual boxes only turn red to show which are still missing.
        const groupError = item.fields
          .map((f) => errors[f.name] as { message?: string } | undefined)
          .find(Boolean);

        return (
          <Field key={item.title} data-invalid={!!groupError}>
            <FieldLabel>{item.title}</FieldLabel>
            <div className="flex flex-col gap-2">
              {item.fields.map((f) =>
                f.kind === 'checkbox' ? (
                  <div key={f.name}>{checkboxRow(f, !!errors[f.name])}</div>
                ) : null
              )}
            </div>
            <FieldError errors={groupError ? [groupError] : []} />
          </Field>
        );
      })}
    </div>
  );
}
