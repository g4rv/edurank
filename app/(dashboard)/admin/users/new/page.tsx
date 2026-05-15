import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { UserForm } from '@/components/admin/user-form';
import { createUser } from '@/app/(dashboard)/admin/users/actions';

export default async function NewUserPage() {
  const session = await auth();
  if (session?.user.role !== 'ADMIN') redirect('/');

  const availableStaff = await db.staff.findMany({
    where: { user: null },
    select: { id: true, lastName: true, firstName: true, patronymic: true, email: true },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });

  return (
    <div className="max-w-lg space-y-6">
      <Link
        href="/admin/users"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Користувачі
      </Link>

      <h1 className="text-2xl font-semibold">Новий користувач</h1>

      <UserForm mode="create" action={createUser} availableStaff={availableStaff} />
    </div>
  );
}
