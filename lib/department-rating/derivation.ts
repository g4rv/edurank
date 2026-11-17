import { z } from 'zod';

/**
 * Which personal-rating entries a Рейтинг кафедри line can be counted from
 * (owner, 2026-11-16) — stored as `DepartmentIndicator.derivation`, so next
 * year's mapping is data, the way `ActivityType.licencePositions` is.
 *
 * - `FULL`: the personal entry decides the line exactly. The report offers the
 *   count with «Використати N».
 * - `PARTIAL`: the personal entries are only part of it (a wider line, an
 *   option that also covers other cases). A hint that needs a person's check.
 *
 * The number is never written into the report by itself: the head accepts it
 * or types their own. See docs/superpowers/specs/2026-11-16-department-rating-derived-values-design.md.
 */
export type DerivationCoverage = 'FULL' | 'PARTIAL';

export interface DerivationSource {
  /**
   * The personal indicator's `ActivityType.code`. Identity across years only —
   * a cloned template copies it while `itemNumber` moves — never behaviour.
   */
  code: string;
  /** Only the entries whose select `field` holds one of these options */
  when?: { field: string; in: string[] };
  /** Evidence fields that identify the work, strongest first (ISBN, DOI, a number) */
  keys: string[];
  /** The evidence field shown for the work and compared word by word to join copies */
  text: string;
}

export interface Derivation {
  coverage: DerivationCoverage;
  from: DerivationSource[];
}

const derivationSchema = z.object({
  coverage: z.enum(['FULL', 'PARTIAL']),
  from: z
    .array(
      z.object({
        code: z.string().min(1),
        when: z.object({ field: z.string().min(1), in: z.array(z.string()).min(1) }).optional(),
        keys: z.array(z.string().min(1)),
        text: z.string().min(1),
      })
    )
    .min(1),
});

/**
 * The stored JSON as a `Derivation`, or null — for a line typed by hand, and
 * for anything malformed. A broken row must not break the report: the line
 * simply stops offering a number, as it did before the column existed.
 */
export function readDerivation(stored: unknown): Derivation | null {
  if (stored === null || stored === undefined) return null;
  const parsed = derivationSchema.safeParse(stored);
  return parsed.success ? parsed.data : null;
}

/** Every personal indicator code any of these lines reads */
export function derivationCodes(derivations: readonly (Derivation | null)[]): string[] {
  const codes = new Set<string>();
  for (const d of derivations) for (const s of d?.from ?? []) codes.add(s.code);
  return [...codes];
}
