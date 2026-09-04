'use client';

import * as React from 'react';
import { EMPTY, requiredFieldNames } from '@/lib/forms/required-fields';

const RequiredFieldsContext = React.createContext<ReadonlySet<string>>(EMPTY);

/**
 * Wraps one form and tells the `FormField`s inside it which of them are
 * obligatory, by reading the form's own Zod schema.
 *
 * One line per FORM — sixteen of them — rather than a prop on each of the ~70
 * fields. Forms whose fields are all required (login, «забули пароль»,
 * activation) get an empty set from `requiredFieldNames` and so mark nothing,
 * without needing to know they are a special case.
 *
 * Anything rendered outside a provider marks nothing, so this is safe to adopt
 * form by form and safe to forget on a form that does not want it.
 */
export function RequiredFields({
  schema,
  children,
}: {
  /** The same schema handed to `standardSchemaResolver` for this form */
  schema: unknown;
  children: React.ReactNode;
}) {
  // Schemas are module constants in every case but the achievement form, where
  // it is held in state — so the identity is stable and this runs once.
  const names = React.useMemo(() => requiredFieldNames(schema), [schema]);
  return <RequiredFieldsContext.Provider value={names}>{children}</RequiredFieldsContext.Provider>;
}

/** True when this field name is obligatory on the surrounding form. */
export function useIsRequiredField(name: string | undefined): boolean {
  const names = React.useContext(RequiredFieldsContext);
  return name ? names.has(name) : false;
}
