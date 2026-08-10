import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { canModerateRating } from '@/lib/rating/moderation';
import { getEditorDivisionId } from '@/lib/permissions';
import { listEntryDivisions } from '@/lib/queries/list-division-data';
import { scopeOf } from '@/lib/queries/scope';
import { Sidebar } from '@/components/sidebar';
import { Toaster } from '@/components/ui/sonner';

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

  return (
    <div className="flex h-screen bg-background">
      <Sidebar
        user={session.user}
        isNpp={staff?.isNpp ?? false}
        canModerate={canModerate}
        canEnterData={canEnterData}
        headsDepartment={headsDepartment}
      />
      <main className="flex-1 overflow-auto p-6">{children}</main>
      <Toaster position="bottom-right" richColors />
    </div>
  );
}
