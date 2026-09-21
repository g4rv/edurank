/**
 * Reading a sort out of a query string.
 *
 * Both values reach Prisma's `orderBy`, so neither may be taken as typed. The
 * field is checked against a whitelist the query owns — a caller who could name
 * any column would be choosing what the database sorts on, and a misspelt one
 * would be a 500 instead of a list.
 *
 * `searchParams` hands back `string | string[] | undefined` (a param repeated
 * in the URL arrives as an array), so both helpers take the first value and
 * fall back rather than refusing.
 */

export type SortDir = 'asc' | 'desc';

/** Ascending unless the URL says otherwise — so a bare `/faculties` is A→Я. */
export function parseSortDir(value: unknown): SortDir {
  const v = Array.isArray(value) ? value[0] : value;
  return v === 'desc' ? 'desc' : 'asc';
}

export function parseSortField<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T
): T {
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}
