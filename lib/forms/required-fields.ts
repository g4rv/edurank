/**
 * Which fields of a form are obligatory — read off the Zod schema, never marked
 * by hand.
 *
 * The schema is already this project's single source of truth for validation
 * (see CLAUDE.md), so it is also the only honest answer to «is this field
 * required». A `required` prop typed onto each `<FormField>` would be a second
 * copy of that fact, and the two would drift the first time somebody made a
 * column optional in the schema and forgot the form — leaving a star on a field
 * that saves happily empty.
 *
 * There are ~70 static fields plus every admin-built indicator form, and none
 * of them need touching: `FormField` already receives `htmlFor`, which is
 * already the schema key at every call site.
 */

/**
 * A schema is not always the object itself — `.refine()` / `.superRefine()`
 * wrap it, and several schemas here do (password confirmation, «at least one
 * кафедра»). Unwrap until an object shape appears, or give up.
 *
 * Deliberately untyped: Zod's wrapper internals are not part of its public API
 * and have moved between majors. Everything here is defensive, and the failure
 * mode is «mark nothing», which is exactly the behaviour before this existed.
 */
function objectShape(schema: unknown): Record<string, unknown> | null {
  let cur = schema as { shape?: Record<string, unknown>; _def?: Record<string, unknown> } | null;
  for (let depth = 0; depth < 8 && cur; depth++) {
    if (cur.shape && typeof cur.shape === 'object') return cur.shape;
    const def = cur._def as { schema?: unknown; innerType?: unknown } | undefined;
    cur = (def?.schema ?? def?.innerType ?? null) as typeof cur;
  }
  return null;
}

/** Does this field accept being absent? Cheaper and more robust than reading
 *  Zod's internal type tags, which differ across majors. */
function acceptsUndefined(field: unknown): boolean {
  const f = field as { safeParse?: (v: unknown) => { success: boolean } };
  if (typeof f?.safeParse !== 'function') return true;
  return f.safeParse(undefined).success;
}

/**
 * The field names to mark on this form.
 *
 * **Returns an empty set when every field is required** (owner, 2026-09-04).
 * A star against all of them tells the reader nothing — it is only information
 * when it distinguishes. That rule is what keeps `/login`, `/forgot-password`
 * and the activation form clean without any of them needing a special case:
 * they are all-required, so they naturally get nothing.
 *
 * (A form that is 24-of-25 required is technically noisy by the same argument,
 * but no form here is shaped like that, and a threshold would be a rule nobody
 * could predict from looking at a screen.)
 */
export function requiredFieldNames(schema: unknown): ReadonlySet<string> {
  const shape = objectShape(schema);
  if (!shape) return EMPTY;

  const keys = Object.keys(shape);
  const required = keys.filter((k) => !acceptsUndefined(shape[k]));
  if (required.length === 0 || required.length === keys.length) return EMPTY;
  return new Set(required);
}

export const EMPTY: ReadonlySet<string> = new Set<string>();
