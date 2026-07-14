import { z } from 'zod';
import { EVIDENCE_FIELDS, type EvidenceField } from '@/lib/rating/evidence-fields';

// Builds one Zod schema per activity type from its evidence field specs.
// Shared client (RHF resolver) + server (submit action) — single source of truth.

const emptyToUndefined = (v: unknown) =>
  v === '' || v === null || (typeof v === 'string' && !v.trim()) ? undefined : v;

function fieldSchema(f: EvidenceField): z.ZodType {
  switch (f.kind) {
    case 'text': {
      const base = z
        .string({ error: "Обов'язкове поле" })
        .trim()
        .max(2000, { error: 'Занадто довге значення' });
      return f.optional
        ? z.preprocess(emptyToUndefined, base.min(1).optional())
        : base.min(1, { error: "Обов'язкове поле" });
    }
    case 'number': {
      const min = f.min ?? 0;
      let base = z.coerce
        .number({ error: 'Має бути числом' })
        .min(min, { error: `Мінімальне значення — ${min}` });
      if (f.int) base = base.int({ error: 'Має бути цілим числом' });
      return f.optional ? z.preprocess(emptyToUndefined, base.optional()) : base;
    }
    case 'url': {
      const base = z.url({ error: 'Некоректне посилання' }).max(2000);
      return f.optional ? z.preprocess(emptyToUndefined, base.optional()) : base;
    }
    case 'date': {
      const base = z.iso.date({ error: 'Некоректна дата' });
      return f.optional ? z.preprocess(emptyToUndefined, base.optional()) : base;
    }
    case 'checkbox': {
      return f.mustBeTrue
        ? z.literal(true, { error: 'Потрібно підтвердити' })
        : z.boolean({ error: 'Оберіть значення' }).default(false);
    }
    case 'select': {
      const values = f.options.map((o) => o.value) as [string, ...string[]];
      return z.enum(values, { error: 'Оберіть значення зі списку' });
    }
  }
}

/** Zod schema for an arbitrary subset of evidence fields (e.g. the shared
 *  fields of an entity-first group entry, validated apart from the role) */
export function schemaForFields(
  fields: readonly EvidenceField[]
): z.ZodType<Record<string, unknown>> {
  const shape = Object.fromEntries(fields.map((f) => [f.name, fieldSchema(f)]));
  return z.strictObject(shape) as unknown as z.ZodType<Record<string, unknown>>;
}

const schemaCache = new Map<string, z.ZodType<Record<string, unknown>>>();

/** Zod schema for one activity type's evidence; throws on unknown code */
export function evidenceSchemaFor(code: string): z.ZodType<Record<string, unknown>> {
  const cached = schemaCache.get(code);
  if (cached) return cached;

  const fields = EVIDENCE_FIELDS[code];
  if (!fields) throw new Error(`No evidence fields defined for activity type: ${code}`);

  const shape = Object.fromEntries(fields.map((f) => [f.name, fieldSchema(f)]));
  const schema = z.strictObject(shape) as unknown as z.ZodType<Record<string, unknown>>;
  schemaCache.set(code, schema);
  return schema;
}
