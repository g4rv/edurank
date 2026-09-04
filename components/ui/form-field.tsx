'use client';

import * as React from 'react';
import { Field, FieldLabel, FieldDescription, FieldError } from '@/components/ui/field';
import { useIsRequiredField } from '@/components/ui/required-fields';
import { cn } from '@/lib/utils';

interface FormFieldProps {
  label?: string;
  /** Rendered inside the label after the text (e.g. an "affects rating" hint icon) */
  labelSuffix?: React.ReactNode;
  htmlFor?: string;
  /**
   * The schema key, when it differs from `htmlFor`. Normally it does not — every
   * call site in this app already uses the field name as the id — so this is
   * only for a field whose element id has to be something else.
   */
  name?: string;
  /**
   * Force the required marker on or off, overriding what the form's schema
   * says. For a field the schema cannot describe: a control outside the form
   * object, or one whose requirement is decided by another answer.
   */
  required?: boolean;
  hideLabel?: boolean;
  description?: string;
  error?: { message?: string };
  startAdornment?: React.ReactNode;
  endAdornment?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

export function FormField({
  label,
  labelSuffix,
  htmlFor,
  name,
  required,
  hideLabel = false,
  description,
  error,
  startAdornment,
  endAdornment,
  className,
  children,
}: FormFieldProps) {
  // Read off the form's Zod schema, never marked by hand — see
  // `lib/forms/required-fields.ts`. An explicit `required` still wins.
  const schemaSaysRequired = useIsRequiredField(name ?? htmlFor);
  const isRequired = required ?? schemaSaysRequired;

  return (
    <Field data-invalid={!!error} className={className}>
      {label && (
        <FieldLabel htmlFor={htmlFor} className={cn(hideLabel && 'sr-only')}>
          {label}
          {isRequired && (
            <>
              {/* Same colour as the label, deliberately (owner, 2026-09-04):
                  red is reserved for destructive and error in this app, and a
                  field being obligatory is neither. */}
              <span aria-hidden="true" className="-ml-1">
                *
              </span>
              {/* The star is decoration to a screen reader. This is what
                  actually carries the meaning, read as part of the label. */}
              <span className="sr-only">, обов&apos;язкове поле</span>
            </>
          )}
          {labelSuffix}
        </FieldLabel>
      )}
      {startAdornment || endAdornment ? (
        <div className="relative">
          {startAdornment && (
            <span
              className={cn(
                'pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground'
              )}
            >
              {startAdornment}
            </span>
          )}
          {children}
          {endAdornment && (
            <span className={cn('absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground')}>
              {endAdornment}
            </span>
          )}
        </div>
      ) : (
        children
      )}
      {description && <FieldDescription>{description}</FieldDescription>}
      <FieldError errors={error ? [error] : []} />
    </Field>
  );
}
