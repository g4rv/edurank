import { redirect, notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import { MOCK_STAFF } from '@/app/(dashboard)/_mock/staff';

/**
 * The Характеристика tab. Same story: this is the only segment Next re-renders
 * when the tab changes, and it keeps its own auth check.
 */
export default async function StaffMockKharakterystykaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect('/login');

  const { id } = await params;
  if (!MOCK_STAFF[id]) notFound();

  return (
    <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-dashed bg-muted/25 px-5 py-8 text-center text-sm text-muted-foreground">
      Тут буде документ за п.38 — він уже існує на
      <code className="mx-1">/staff/[id]/kharakterystyka</code>. У чернетці показано лише те, що
      змінюється при перемиканні вкладок.
    </div>
  );
}
