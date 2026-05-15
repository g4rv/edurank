import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { UserForm } from '@/components/admin/user-form';
import { updateUser } from '@/app/(dashboard)/admin/users/actions';

export default async function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (session?.user.role !== 'ADMIN') redirect('/');

  const user = await db.user.findUnique({
    where: { id },
    select: { id: true, email: true, role: true, staffId: true },
  });

  if (!user) notFound();

  const availableStaff = await db.staff.findMany({
    where: user.staffId ? { OR: [{ user: null }, { id: user.staffId }] } : { user: null },
    select: { id: true, lastName: true, firstName: true, patronymic: true, email: true },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });

  const action = updateUser.bind(null, id);

  return (
    <div className="max-w-lg space-y-6">
      <Link
        href="/admin/users"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Користувачі
      </Link>

      <div>
        <h1 className="text-2xl font-semibold">Редагування</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{user.email}</p>
      </div>

      <UserForm
        mode="edit"
        defaultValues={{ email: user.email, role: user.role, staffId: user.staffId }}
        action={action}
        availableStaff={availableStaff}
      />
    </div>
  );
}
