import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { canModerateRating } from '@/lib/rating/moderation';
import { canActForDivision, getEditorDivisionId } from '@/lib/permissions';
import { listEntryDivisions } from '@/lib/queries/list-division-data';
import { scopeOf } from '@/lib/queries/scope';
import { activeYear } from '@/lib/queries/get-active-template';
import { getRatingEntry } from '@/lib/queries/get-rating';
import { sectionScores } from '@/lib/rating/section-scores';
import { NPP_RATING_OPEN } from '@/lib/rating/npp-access';
import { Sidebar } from '@/components/sidebar';
import { NavDrawer } from '@/components/nav-drawer';
import { Toaster } from '@/components/ui/sonner';
import { AuroraWash } from '@/components/ui/aurora-wash';

async function canEnterDivisionData(user: {
  role: 'ADMIN' | 'EDITOR' | 'USER';
  staffId?: string | null;
}): Promise<boolean> {
  if (user.role === 'ADMIN') return true;
  if (user.role !== 'EDITOR') return false;
  const own = await getEditorDivisionId(user.staffId);
  if (!own) return false;
  return (await listEntryDivisions()).some((d) => d.id === own);
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect('/login');

  const canModerate = await canModerateRating(session.user);
  const canEnterData = await canEnterDivisionData(session.user);

  // Наукова робота oversight (Task 11) is ADMIN, or exactly ННВ's editors —
  // resolved by registryKey, its own check rather than `canModerateRating`.
  // That flag can be granted to a different division for rating moderation,
  // while science-plan oversight belongs to ННВ specifically by наказ. Mirrors
  // the same check in app/(dashboard)/science-plans/page.tsx, which enforces
  // it again server-side regardless of what the nav shows.
  const nnv = await db.division.findUnique({
    where: { registryKey: 'NNV' },
    select: { id: true },
  });
  const canOverseeSciencePlans =
    session.user.role === 'ADMIN' ||
    (nnv !== null && (await canActForDivision(session.user, nnv.id)));

  // Headship is derived from Department.headId / Faculty.deanId rather than
  // from a Role, so the nav has to ask rather than read it off the session.
  const headsDepartment = (await scopeOf(session.user.staffId)).length > 0;

  // Fresh from DB, not the session token: an admin may flip НПП/адміністративний
  // mid-session, and the rating nav must follow immediately.
  const staff = session.user.staffId
    ? await db.staff.findUnique({
        where: { id: session.user.staffId },
        select: { isNpp: true },
      })
    : null;

  // The year's score per section, for the nav. Two indexed single-row queries,
  // measured at 2.5ms against a 169-357ms response — but they are behind this
  // gate anyway, so somebody with no rating group to hang them on pays nothing.
  // `NPP_RATING_OPEN` is in the condition because the group itself disappears
  // when the rating is closed, and numbers for a nav that is not drawn are
  // two queries spent on nothing.
  const isNpp = staff?.isNpp ?? false;
  const year = isNpp && NPP_RATING_OPEN ? await activeYear() : null;
  const ratingTotals =
    year && session.user.staffId
      ? sectionScores(await getRatingEntry(session.user.staffId, year))
      : null;

  // Built once and handed to both the rail and the drawer, so the two can never
  // be given different answers about who may see what.
  const nav = {
    user: session.user,
    isNpp,
    canModerate,
    canEnterData,
    headsDepartment,
    canOverseeSciencePlans,
    ratingTotals,
  };

  return (
    // No `bg-background` here any more: it would paint over the wash, which
    // sits behind everything at `-z-10`. The wash carries the same tint, so the
    // ground is unchanged for anything that cannot render it.
    <div className="flex h-screen">
      <AuroraWash />
      <Sidebar {...nav} />
      {/* `min-w-0`, or a wide child — the rating table, a long heading — sets
          this column's floor and pushes the page sideways instead of scrolling
          inside its own container. A flex item's default `min-width: auto` is
          the content, not zero. */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Below `md` only; the rail above it. Same props, same component. */}
        <NavDrawer {...nav} />
        {/* `p-4` on a phone: `p-6` spent 48 of 400px on margin. */}
        <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
      </div>
      <Toaster position="bottom-right" richColors />
    </div>
  );
}
