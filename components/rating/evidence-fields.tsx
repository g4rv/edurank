'use client';

import {
  Controller,
  type Control,
  type FieldErrors,
  type FieldValues,
  type UseFormRegister,
} from 'react-hook-form';
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
import { MOODLE_MODE_POINTS, SELECT_OPTION_POINTS } from '@/lib/rating/scoring';
import { MIN_EVIDENCE_YEAR } from '@/validations/activity-evidence';

const DATE_MIN = `${MIN_EVIDENCE_YEAR}-01-01`;
const DATE_MAX = `${new Date().getFullYear() + 1}-12-31`;

interface EvidenceFieldsProps {
  code: string;
  fields: readonly EvidenceField[];
  register: UseFormRegister<FieldValues>;
  control: Control<FieldValues>;
  errors: FieldErrors<FieldValues>;
  disabled?: boolean;
}

function optionSuffix(code: string, fieldName: string, value: string): string {
  if (fieldName === 'mode') {
    const points = MOODLE_MODE_POINTS[value as keyof typeof MOODLE_MODE_POINTS];
    return points ? ` — ${points} балів` : '';
  }
  if (fieldName === 'option') {
    const points = (SELECT_OPTION_POINTS as Record<string, Record<string, number>>)[code]?.[value];
    return points ? ` — ${points} балів` : '';
  }
  return '';
}

/** Renders one activity type's evidence inputs from its field specs */
export function EvidenceFields({
  code,
  fields,
  register,
  control,
  errors,
  disabled,
}: EvidenceFieldsProps) {
  return (
    <div className="space-y-4">
      {fields.map((f) => {
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
                <Controller
                  name={f.name}
                  control={control}
                  render={({ field }) => (
                    <label className="flex cursor-pointer items-center gap-2.5 text-sm">
                      <Switch
                        checked={field.value === true}
                        onCheckedChange={field.onChange}
                        disabled={disabled}
                        aria-invalid={!!error}
                      />
                      {f.label}
                    </label>
                  )}
                />
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
                            {optionSuffix(code, f.name, o.value)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>
            );
        }
      })}
    </div>
  );
}
