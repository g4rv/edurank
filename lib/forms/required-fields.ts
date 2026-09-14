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
export function requiredFieldNames(
  schema: unknown,
  {
    /**
     * Keep the stars even when every field is required.
     *
     * **For a form that SWAPS IN PLACE** (owner, 2026-09-11). The rule above
     * assumes a form is a screen: login, «забули пароль», activation — each
     * seen alone, so «all required, therefore mark none» is quiet and costs
     * nothing, because the reader has nothing to compare it against.
     *
     * The achievement dialog breaks that assumption. Its fields are rebuilt
     * from whichever indicator is chosen, so п.3.8 draws «Квартиль *» and
     * «Бібліографічний опис *» and п.1.5, whose two fields both happen to be
     * required, draws nothing — in the same dialog, seconds apart. The reader
     * has just learnt what a star means, so a form without them reads as «these
     * are optional», and the correction arrives as a validation error.
     *
     * Consistency within the container wins there: where the form changes under
     * the reader, the star has to mean the same thing every time.
     */
    alwaysMark = false,
  }: { alwaysMark?: boolean } = {}
): ReadonlySet<string> {
  const shape = objectShape(schema);
  if (!shape) return EMPTY;

  const keys = Object.keys(shape);
  const required = keys.filter((k) => !acceptsUndefined(shape[k]));
  if (required.length === 0) return EMPTY;
  if (!alwaysMark && required.length === keys.length) return EMPTY;
  return new Set(required);
}

export const EMPTY: ReadonlySet<string> = new Set<string>();
