import { db } from '@/lib/db';
import { sameDoi } from '@/lib/doi';
import type { EvidenceField } from '@/lib/rating/evidence-fields';

/**
 * One DOI once per person per POINT, across every year (owner, 2026-10-27).
 * The same article may still count under two different points, and co-authors
 * each enter it for themselves — so the check is the person's own entries of
 * this indicator. A discarded entry (REMOVED) or a deleted one frees the DOI.
 *
 * «The same point in another year» is matched by `code`: a cloned template
 * copies it, while `itemNumber` moves (3.11 was 3.10 last year) and the id is
 * the year's own. This is identity, not behaviour — no rule is keyed on it.
 *
 * Production held three pairs this would have refused, all the same mistake: a
 * second, different article saved with the first one's DOI pasted in.
 */
export async function doiClash(
  staffId: string,
  code: string,
  fields: readonly EvidenceField[],
  evidence: Record<string, unknown>,
  /** The entry being restored, which must not clash with itself */
  exceptId?: string
): Promise<{ itemNumber: string; year: number } | null> {
  const names = fields.filter((f) => f.kind === 'doi').map((f) => f.name);
  const wanted = names
    .map((n) => evidence[n])
    .filter((v): v is string => typeof v === 'string' && v.trim() !== '');
  if (wanted.length === 0) return null;

  const mine = await db.activity.findMany({
    where: {
      staffId,
      status: { not: 'REMOVED' },
      activityType: { code },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { year: true, evidence: true, activityType: { select: { itemNumber: true } } },
  });
  for (const a of mine) {
    const stored = (a.evidence ?? {}) as Record<string, unknown>;
    const clash = names.some((n) => {
      const v = stored[n];
      return typeof v === 'string' && wanted.some((w) => sameDoi(w, v));
    });
    if (clash) {
      return { itemNumber: a.activityType.itemNumber, year: a.year };
    }
  }
  return null;
}

/** The sentence an НПП gets when entering a DOI they already hold. */
export async function reusedDoi(
  staffId: string,
  code: string,
  fields: readonly EvidenceField[],
  evidence: Record<string, unknown>
): Promise<string | null> {
  const clash = await doiClash(staffId, code, fields, evidence);
  return clash
    ? `Цей DOI ви вже подали у п. ${clash.itemNumber} (${clash.year}). Перевірте DOI — можливо, його скопійовано з іншої публікації`
    : null;
}
