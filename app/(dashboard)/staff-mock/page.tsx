import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { Avatar } from '@/components/ui/avatar';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { AnimatedPage } from '@/components/ui/animated-page';
import { fullName } from '@/components/staff/profile/primitives';
import { MOCK_STAFF } from '../_mock/staff';

/** Index for the rehearsal — three invented people to open. */
export default async function StaffMockIndexPage() {
  const session = await auth();
  if (!session) redirect('/login');

  return (
    <AnimatedPage className="space-y-5">
      <Breadcrumbs items={[{ label: 'Персонал', href: '/staff' }, { label: 'Чернетка' }]} />

      <div className="rounded-xl border border-dashed bg-muted/25 p-4">
        <p className="text-sm font-medium">Чернетка сторінки працівника — вкладки на layout</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Відкрийте будь-кого й перемикайте вкладки: шапка, хлібні крихти й самі вкладки не
          перемальовуються — Next зберігає layout між дочірніми сторінками. Кожна вкладка має власну
          адресу, тож «назад» і закладки працюють.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {Object.values(MOCK_STAFF).map((s) => (
          <Link
            key={s.id}
            href={`/staff-mock/${s.id}`}
            className="flex items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-brand/40"
          >
            <Avatar name={fullName(s)} size="sm" />
            <span className="text-sm font-medium">{fullName(s)}</span>
            <span className="text-sm text-muted-foreground">
              {s.archivedAt ? 'архівований' : s.orcidId ? 'усе заповнено' : 'нічого не заповнено'}
            </span>
          </Link>
        ))}
      </div>
    </AnimatedPage>
  );
}
