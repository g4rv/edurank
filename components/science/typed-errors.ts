import type { FieldErrors, FieldValues } from 'react-hook-form';

/**
 * Only the errors of fields somebody has typed into (owner, 2026-09-24).
 *
 * The science dialogs keep «Додати» disabled until the form is complete
 * instead of refusing it with a column of «Обов'язкове поле» — so an empty
 * field says nothing. But a field holding something WRONG («sadasd» in a ПІБ
 * box, which takes Ukrainian letters only) must say so, or the button stays
 * grey with no reason anywhere on screen.
 */
export function typedErrors(
  errors: FieldErrors<FieldValues>,
  values: Record<string, unknown> | undefined
): FieldErrors<FieldValues> {
  return Object.fromEntries(
    Object.entries(errors).filter(([name]) => {
      const value = values?.[name];
      if (value === undefined || value === null) return false;
      if (typeof value === 'string') return value.trim() !== '';
      return true;
    })
  ) as FieldErrors<FieldValues>;
}
