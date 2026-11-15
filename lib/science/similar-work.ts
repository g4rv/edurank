import { db } from '@/lib/db';
import { RECORD_LINK_IDENTITY } from '@/lib/science/identity';
import { sameWorkByText } from '@/lib/science/similar-title';
import { doiLinkKey, normalizeUrl } from '@/lib/science/work-key';

/**
 * The work already on file that THIS one is a retyped copy of — or null.
 * Returns its `dedupKey`, so the caller can run the same conflict path an exact
 * match takes («додайте як співавтора»).
 *
 * Why it exists (owner, 2026-11-13): an ordinary link no longer identifies a
 * work — two authors in one збірник share its page, and keying on it refused
 * the second one's own article. But the description is free text, so a real
 * copy is rarely typed the same way and the title key alone misses it. So when
 * two works share a LINK, their descriptions are compared by words
 * (`sameWorkByText`).
 *
 * Reads each candidate's stored `link`, not its key, so a work saved before
 * this rule — under the old `url:` key — is found too.
 *
 * Only for a SHARED type that names `link` as an identity (the article). A DOI
 * link is the exact key's business, and a person's own INDIVIDUAL works are
 * keyed per person already.
 */
export async function findSimilarWorkKey(input: {
  typeCode: string;
  sharing: string;
  identityFields: readonly string[];
  link: string | null | undefined;
  title: unknown;
  /** An EDIT must not find the very work being edited. */
  excludeWorkId?: string;
}): Promise<string | null> {
  if (input.sharing !== 'SHARED') return null;
  if (!input.identityFields.includes(RECORD_LINK_IDENTITY)) return null;
  if (!input.link || typeof input.title !== 'string' || !input.title.trim()) return null;
  if (doiLinkKey(input.link)) return null;

  const mine = normalizeUrl(input.link);
  if (!mine) return null;
  // A bare host (no path) tells nothing.
  const slash = mine.indexOf('/');
  if (slash === -1 || mine.length - slash < 2) return null;

  // Every work of the type that has a link, compared in CODE through the same
  // `normalizeUrl` as `mine`. Asking the database `link contains <path>` was
  // tried and is wrong twice over (review, 2026-11-13): a stored link typed with
  // a space or Cyrillic never contains its own percent-encoded form, so the copy
  // saved; and a `take` cap let a common path like `/index.php` crowd the real
  // one out. The rows are few (about a hundred articles) and three columns wide.
  const candidates = await db.scienceWork.findMany({
    where: {
      workType: { code: input.typeCode },
      link: { not: null },
      ...(input.excludeWorkId ? { id: { not: input.excludeWorkId } } : {}),
    },
    select: { dedupKey: true, link: true, evidence: true },
  });

  for (const c of candidates) {
    if (!c.link || normalizeUrl(c.link) !== mine) continue;
    const title = (c.evidence as { title?: unknown } | null)?.title;
    if (typeof title === 'string' && sameWorkByText(input.title, title)) return c.dedupKey;
  }
  return null;
}
