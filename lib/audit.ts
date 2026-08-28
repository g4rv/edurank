type JsonPrimitive = string | number | boolean | null;

/**
 * What a caller may hand in. `Date` is here because Prisma returns one for
 * every date column and Zod produces one for every date field — and two Date
 * objects holding the same instant are never `!==`-equal, so comparing them
 * raw reports a change on every save. Normalised to an ISO string before the
 * comparison, which is also what the JSON column would have stored anyway.
 */
export type DiffValue = JsonPrimitive | Date | undefined;

function normalise(value: DiffValue): JsonPrimitive {
  if (value === undefined || value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

export function diffChanges(
  before: Record<string, DiffValue>,
  after: Record<string, DiffValue>
): Record<string, { from: JsonPrimitive; to: JsonPrimitive }> {
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const result: Record<string, { from: JsonPrimitive; to: JsonPrimitive }> = {};
  for (const key of allKeys) {
    const from = normalise(before[key]);
    const to = normalise(after[key]);
    if (from !== to) {
      result[key] = { from, to };
    }
  }
  return result;
}
