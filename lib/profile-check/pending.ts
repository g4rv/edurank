/**
 * Who still needs asking, for the run popup's «ще не перевіряли» (owner,
 * 2026-11-05). Scholar and Web of Science refuse a long run part-way, so the
 * way through the list is to ask only those who have no answer yet — and come
 * back later for the rest.
 *
 * A person needs a check on a platform when they HAVE a link there and:
 * - nothing was ever stored for them, or
 * - the last attempt `failed` (we could not ask; there is no answer), or
 * - the stored row says `no_link` but a link has been added since.
 *
 * Someone with no link on the platform has nothing to ask a site about, so they
 * never count; and an answer — `ok`, `warning`, `error` — is an answer, even a
 * bad one: that is what «Є проблеми» re-checks, not this.
 */
import type { Platform } from '@/lib/profile-check/types';

export interface StoredCell {
  status: string;
}

export function needsCheck(
  link: string | null | undefined,
  stored: StoredCell | undefined
): boolean {
  if (!link?.trim()) return false;
  if (!stored) return true;
  return stored.status === 'failed' || stored.status === 'no_link';
}

/** What the run popup offers for one platform: everyone, and those not yet answered. */
export function runCounts(
  people: { staffId: string; links: Partial<Record<Platform, string | null>> }[],
  stored: Map<string, Partial<Record<Platform, StoredCell>>>,
  platform: Platform,
  /** With «Є проблеми» on: only these people are in scope */
  onlyIds?: ReadonlySet<string>
): { all: number; missing: number } {
  const scope = onlyIds ? people.filter((p) => onlyIds.has(p.staffId)) : people;
  const withLink = scope.filter((p) => p.links[platform]?.trim());
  return {
    all: withLink.length,
    missing: withLink.filter((p) =>
      needsCheck(p.links[platform], stored.get(p.staffId)?.[platform])
    ).length,
  };
}
