import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { Sidebar } from '@/components/sidebar';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect('/login');

  return (
    <div className="flex h-screen bg-background">
      <Sidebar user={session.user} />
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  );
}
