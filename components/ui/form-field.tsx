'use client';

import * as React from 'react';
import { Field, FieldLabel, FieldDescription, FieldError } from '@/components/ui/field';
import { cn } from '@/lib/utils';

interface FormFieldProps {
  label?: string;
  htmlFor?: string;
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
  htmlFor,
  hideLabel = false,
  description,
  error,
  startAdornment,
  endAdornment,
  className,
  children,
}: FormFieldProps) {
  return (
    <Field data-invalid={!!error} className={className}>
      {label && (
        <FieldLabel htmlFor={htmlFor} className={cn(hideLabel && 'sr-only')}>
          {label}
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
