import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { canModerateRating } from '@/lib/rating/moderation';
import { getEditorDivisionId } from '@/lib/permissions';
import { listEntryDivisions } from '@/lib/queries/list-division-data';
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

  return (
    <div className="flex h-screen bg-background">
      <Sidebar user={session.user} canModerate={canModerate} canEnterData={canEnterData} />
      <main className="flex-1 overflow-auto p-6">{children}</main>
      <Toaster position="bottom-right" richColors />
    </div>
  );
}
