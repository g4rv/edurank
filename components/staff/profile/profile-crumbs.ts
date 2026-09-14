import type { Crumb } from '@/components/ui/breadcrumbs';
import type { Role } from '@/lib/generated/prisma/client';

/**
 * The trail to your own profile, and to anything under it.
 *
 * **One function because the root depends on the role and the depth does not.**
 * `/profile` built the role-aware root itself, `/profile/edit` hardcoded two
 * levels and dropped it — so the same person saw «Особисте › Мій профіль» on
 * one page and «Мій профіль › Редагування» on the next, losing a level on the
 * way in. `/staff/[id]/edit` had it right all along («Персонал › ПІБ ›
 * Редагування»), which is what made the profile side look like the odd one.
 *
 * **An ADMIN or EDITOR starts at «Персонал»** — they reach their own record
 * from that list as well as from the sidebar, so it is a real ancestor with a
 * real route. For an НПП it is not a page they may open, so the trail starts at
 * the sidebar group, which has no href because it has no page (see
 * `Breadcrumbs`).
 *
 * @param current Label of the page BELOW the profile, when there is one. Given,
 *   «Мій профіль» becomes a link and this is the leaf; omitted, «Мій профіль»
 *   is itself the leaf and takes no href.
 */
export function profileCrumbs(role: Role, current?: string): Crumb[] {
  const root: Crumb =
    role === 'USER' ? { label: 'Особисте' } : { label: 'Персонал', href: '/staff' };

  if (!current) return [root, { label: 'Мій профіль' }];
  return [root, { label: 'Мій профіль', href: '/profile' }, { label: current }];
}
