import { redirect } from 'next/navigation';
import type { Role } from '@/lib/generated/prisma/client';
import { getEditorDivisionId } from '@/lib/permissions';
import { listEntryDivisions } from '@/lib/queries/list-division-data';
import { deanOf, scopeOf } from '@/lib/queries/scope';
import { canModerateRating } from '@/lib/rating/moderation';
import { canOverseeScience } from '@/lib/science/oversight';
import type { PageKey } from './page-access';
import { pageAccessFor } from './page-access-state';
import { startPageFor } from './start-page';

type Viewer = { role: Role; staffId?: string | null };

/**
 * «Дані відділу»: ADMIN, or an editor whose division enters some indicator.
 * Not one of the five switches (owner, 2026-11-25) — it was already this narrow.
 */
export async function canEnterDivisionData(user: Viewer): Promise<boolean> {
  if (user.role === 'ADMIN') return true;
  if (user.role !== 'EDITOR') return false;
  const own = await getEditorDivisionId(user.staffId);
  if (!own) return false;
  return (await listEntryDivisions()).some((d) => d.id === own);
}

/** The first page this person may open — `startPageFor` with its answers gathered */
export async function startPageOf(user: Viewer): Promise<string> {
  if (user.role !== 'EDITOR') return startPageFor({ ...NOTHING, role: user.role });
  const [access, canEnterData, canModerate, oversees, scope, deanships] = await Promise.all([
    pageAccessFor(user),
    canEnterDivisionData(user),
    canModerateRating(user),
    canOverseeScience(user),
    scopeOf(user.staffId),
    deanOf(user.staffId),
  ]);
  return startPageFor({
    role: user.role,
    access,
    canEnterData,
    canModerate,
    canOverseeScience: oversees,
    headsDepartment: scope.length > 0,
    isDean: deanships.length > 0,
  });
}

const NOTHING = {
  access: { staff: false, departments: false, faculties: false, rating: false, charts: false },
  canEnterData: false,
  canModerate: false,
  canOverseeScience: false,
  headsDepartment: false,
  isDean: false,
};

/**
 * The guard at the top of each of the five pages: a viewer whose division does
 * not open it goes to their start page, as a USER always has.
 */
export async function requirePageAccess(user: Viewer, page: PageKey): Promise<void> {
  if ((await pageAccessFor(user))[page]) return;
  redirect(await startPageOf(user));
}
