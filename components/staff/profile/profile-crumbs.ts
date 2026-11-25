import type { Crumb } from '@/components/ui/breadcrumbs';
import type { Role } from '@/lib/generated/prisma/client';

/**
 * The trail to your own profile, and to anything under it.
 *
 * **One function because the root depends on the role and the depth does not.**
 * `/profile` built the role-aware root itself, `/profile/edit` hardcoded two
 * levels and dropped it — so the same person saw «Особисте › Мій профіль» on
 * one page and «Мій профіль › Редагування» on the next, losing a level on the
 * way in. `/staff/[id]/edit` had it right all along («Штат › ПІБ ›
 * Редагування»), which is what made the profile side look like the odd one.
 *
 * **An ADMIN or EDITOR starts at «Штат»** — they reach their own record
 * from that list as well as from the sidebar, so it is a real ancestor with a
 * real route. For an НПП it is not a page they may open, so the trail starts at
 * the sidebar group, which has no href because it has no page (see
 * `Breadcrumbs`).
 *
 * @param current Label of the page BELOW the profile, when there is one. Given,
 *   «Мій профіль» becomes a link and this is the leaf; omitted, «Мій профіль»
 *   is itself the leaf and takes no href.
 */
export function profileCrumbs(role: Role, current?: string, opensStaff?: boolean): Crumb[] {
  // An editor starts at «Штат» only where their division opens it (owner,
  // 2026-11-25); `opensStaff` left out keeps the role's answer.
  const staffRoot = opensStaff ?? role !== 'USER';
  const root: Crumb = staffRoot ? { label: 'Штат', href: '/staff' } : { label: 'Особисте' };

  if (!current) return [root, { label: 'Мій профіль' }];
  return [root, { label: 'Мій профіль', href: '/profile' }, { label: current }];
}
