type JsonPrimitive = string | number | boolean | null;

export function diffChanges(
  before: Record<string, JsonPrimitive | undefined>,
  after: Record<string, JsonPrimitive | undefined>
): Record<string, { from: JsonPrimitive; to: JsonPrimitive }> {
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const result: Record<string, { from: JsonPrimitive; to: JsonPrimitive }> = {};
  for (const key of allKeys) {
    const from = before[key] ?? null;
    const to = after[key] ?? null;
    if (from !== to) {
      result[key] = { from, to };
    }
  }
  return result;
}
