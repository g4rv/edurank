import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { startPageOf } from '@/lib/divisions/start-page-state';

export default async function Home() {
  const session = await auth();
  if (!session) redirect('/login');
  // ADMIN → /staff, a USER → /profile; an editor → the first page their division
  // opens (owner, 2026-11-25 — every editor went to /staff before)
  redirect(await startPageOf(session.user));
}
