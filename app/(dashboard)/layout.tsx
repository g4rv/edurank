import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { canModerateRating } from '@/lib/rating/moderation';
import { Sidebar } from '@/components/sidebar';
import { Toaster } from '@/components/ui/sonner';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect('/login');

  const canModerate = await canModerateRating(session.user);

  return (
    <div className="flex h-screen bg-background">
      <Sidebar user={session.user} canModerate={canModerate} />
      <main className="flex-1 overflow-auto p-6">{children}</main>
      <Toaster position="bottom-right" richColors />
    </div>
  );
}
