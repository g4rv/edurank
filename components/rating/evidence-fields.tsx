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
import { DateInput } from '@/components/aurora/ui/date-input';
import { Input } from '@/components/aurora/ui/input';
import { DoiInput } from '@/components/aurora/ui/doi-input';
import { IsbnInput } from '@/components/aurora/ui/isbn-input';
import { Textarea } from '@/components/aurora/ui/textarea';
import { Switch } from '@/components/aurora/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/aurora/ui/select';
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
  /**
   * The container's own classes — one stacked column by default.
   *
   * The Характеристика's dialog passes `contents`, which drops this wrapper out
   * of the layout so each field becomes a cell of the dialog's own two-column
   * grid. Its forms are short-answer (a рік, a посада, a місце) and one field
   * per row left half the dialog empty beside every one of them.
   */
  className?: string;
}

export type RenderItem =
  | { kind: 'single'; field: EvidenceField }
  | { kind: 'group'; title: string; fields: EvidenceField[] }
  | { kind: 'joined'; title: string; fields: EvidenceField[] };

/**
 * Folds two kinds of run into one block.
 *
 * - consecutive **checkboxes** sharing a `group` title — п.5.1's матеріали
 * - consecutive **text fields** sharing a `join` key — п.15's ПІБ школяра
 *
 * They look alike and mean different things. A checkbox group is several
 * answers under one heading; a joined set is ONE answer someone types in
 * pieces, so it gets one label and prints as one string (`summarizeEvidence`).
 */
export function toRenderItems(fields: readonly EvidenceField[]): RenderItem[] {
  const items: RenderItem[] = [];

  for (const field of fields) {
    const join = field.kind === 'text' ? field.join : undefined;
    if (join) {
      const last = items.at(-1);
      if (last?.kind === 'joined' && last.title === join) last.fields.push(field);
      else items.push({ kind: 'joined', title: join, fields: [field] });
      continue;
    }

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

/**
 * **Every form that renders these must carry `noValidate`.**
 *
 * Some of the inputs below set NATIVE constraints — `min` on a number,
 * `type="url"` on a link — and the browser checks those before React Hook Form
 * ever runs. It then reports them in ENGLISH, in a floating bubble: «Value must
 * be greater than or equal to 1.», «Please enter a URL.» That is the wrong
 * language for this app and the wrong shape for this form, where every other
 * message is an inline red line under its field.
 *
 * It also quietly undid a deliberate kindness: `withProtocol` accepts a pasted
 * `www.scopus.com/…` and adds the scheme, and `type="url"` rejected exactly
 * that before the schema could be generous about it.
 *
 * The attributes stay — they still give a phone the right keyboard and a number
 * field its spinner bounds. `noValidate` only stops the browser ANSWERING.
 * `validations/activity-evidence.ts` is the single voice.
 */
export function EvidenceFields({
  fields,
  register,
  control,
  errors,
  disabled,
  className = 'space-y-4',
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
          <FormField key={f.name} htmlFor={f.name} label={f.label} error={error} span={f.span}>
            {f.multiline ? (
              <Textarea
                id={f.name}
                rows={f.placeholder ? 4 : undefined}
                placeholder={f.placeholder}
                disabled={disabled}
                {...register(f.name)}
              />
            ) : (
              <Input
                id={f.name}
                placeholder={f.placeholder}
                disabled={disabled}
                {...register(f.name)}
              />
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
              max={f.max}
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
            <Controller
              name={f.name}
              control={control}
              render={({ field }) => (
                <DateInput
                  id={f.name}
                  // An evidence value can be absent — the row is saved either
                  // way — so it stays `''` rather than undefined, which would
                  // flip the field to uncontrolled halfway through typing.
                  value={typeof field.value === 'string' ? field.value : ''}
                  onChange={field.onChange}
                  min={DATE_MIN}
                  max={DATE_MAX}
                  disabled={disabled}
                  // Like the `select` case below it, off the same `error`.
                  aria-invalid={!!error}
                />
              )}
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
          <FormField key={f.name} htmlFor={f.name} label={f.label} error={error} span={f.span}>
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
              invalid && 'text-error'
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
    <div className={className}>
      {toRenderItems(fields).map((item) => {
        if (item.kind === 'single') return renderField(item.field);

        if (item.kind === 'joined') {
          // One label over the whole set, and each box says which part it is
          // through its placeholder. «Прізвище / Ім'я / По батькові» as three
          // full labels stacked three field-heights tall for what a reader sees
          // as a single name.
          const joinedError = item.fields
            .map((f) => errors[f.name] as { message?: string } | undefined)
            .find(Boolean);
          const labelled = item.fields.find((f) => f.kind === 'text' && f.joinLabel);
          const title = labelled?.kind === 'text' ? labelled.joinLabel : undefined;

          return (
            <FormField
              key={item.title}
              label={title ?? item.fields[0].label}
              error={joinedError}
              span={2}
            >
              <div className="flex flex-wrap gap-2 sm:flex-nowrap">
                {item.fields.map((f) => (
                  <Input
                    key={f.name}
                    id={f.name}
                    placeholder={f.label}
                    aria-label={f.label}
                    disabled={disabled}
                    className="min-w-0 flex-1"
                    {...register(f.name)}
                  />
                ))}
              </div>
            </FormField>
          );
        }

        // The set fails as one, so it gets one heading and one message.
        // No individual box is marked: a rule like «tick at least one» has no
        // particular box at fault, and reddening whichever one the error
        // happens to be attached to reads as «this is the one you must tick».
        const groupError = item.fields
          .map((f) => errors[f.name] as { message?: string } | undefined)
          .find(Boolean);

        return (
          <Field key={item.title} data-invalid={!!groupError}>
            <FieldLabel>{item.title}</FieldLabel>
            <div className="flex flex-col gap-2">
              {item.fields.map((f) =>
                f.kind === 'checkbox' ? <div key={f.name}>{checkboxRow(f, false)}</div> : null
              )}
            </div>
            <FieldError errors={groupError ? [groupError] : []} />
          </Field>
        );
      })}
    </div>
  );
}
