import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Pencil } from 'lucide-react';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { SortTh } from '@/components/ui/sort-th';
import { AnimatedTableBody } from '@/components/ui/animated-table-body';
import { AnimatedRow } from '@/components/ui/animated-row';
import { DeleteUserButton } from '@/components/admin/delete-user-button';
import type { Role } from '@/lib/generated/prisma/client';

const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Адміністратор',
  EDITOR: 'Редактор',
  USER: 'Користувач',
};

const ROLE_CLASSES: Record<Role, string> = {
  ADMIN: 'bg-purple-500/10 text-purple-600',
  EDITOR: 'bg-green-500/10 text-green-600',
  USER: 'bg-muted text-muted-foreground',
};

const VALID_SORTS = ['email', 'role', 'createdAt'] as const;
type SortField = (typeof VALID_SORTS)[number];

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { sort, dir } = await searchParams;
  const session = await auth();
  if (session?.user.role !== 'ADMIN') redirect('/');

  const sortField =
    typeof sort === 'string' && (VALID_SORTS as readonly string[]).includes(sort)
      ? (sort as SortField)
      : 'createdAt';
  const sortDir = dir === 'desc' ? ('desc' as const) : ('asc' as const);

  const users = await db.user.findMany({
    select: {
      id: true,
      email: true,
      role: true,
      createdAt: true,
      staff: { select: { lastName: true, firstName: true, patronymic: true } },
    },
    orderBy: { [sortField]: sortDir },
  });

  function buildHref(col: SortField) {
    const nextDir = sortField === col && sortDir === 'asc' ? 'desc' : 'asc';
    const sp = new URLSearchParams({ sort: col, dir: nextDir });
    return `/admin/users?${sp.toString()}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Користувачі</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{users.length} записів</p>
        </div>
        <Button asChild>
          <Link href="/admin/users/new">Додати</Link>
        </Button>
      </div>

      {users.length === 0 ? (
        <div className="rounded-xl border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          Користувачів не знайдено
        </div>
      ) : (
        <div className="rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <SortTh
                  label="Email"
                  href={buildHref('email')}
                  active={sortField === 'email'}
                  dir={sortDir}
                />
                <SortTh
                  label="Роль"
                  href={buildHref('role')}
                  active={sortField === 'role'}
                  dir={sortDir}
                />
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Співробітник
                </th>
                <SortTh
                  label="Створено"
                  href={buildHref('createdAt')}
                  active={sortField === 'createdAt'}
                  dir={sortDir}
                />
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Дії</th>
              </tr>
            </thead>
            <AnimatedTableBody>
              {users.map((user) => (
                <AnimatedRow
                  key={user.id}
                  className="relative border-b transition-colors last:border-0 hover:bg-muted/30"
                >
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/admin/users/${user.id}/edit`} className="absolute inset-0" />
                    {user.email}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                        ROLE_CLASSES[user.role]
                      )}
                    >
                      {ROLE_LABELS[user.role]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {user.staff
                      ? `${user.staff.lastName} ${user.staff.firstName} ${user.staff.patronymic}`
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(user.createdAt).toLocaleDateString('uk-UA')}
                  </td>
                  <td className="relative z-10 px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/admin/users/${user.id}/edit`}>
                          <Pencil className="size-4" />
                        </Link>
                      </Button>
                      <DeleteUserButton userId={user.id} userEmail={user.email} />
                    </div>
                  </td>
                </AnimatedRow>
              ))}
            </AnimatedTableBody>
          </table>
        </div>
      )}
    </div>
  );
}
