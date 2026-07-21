import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { cn } from '@/lib/utils';
import { EntityPermissionToggle } from '@/components/admin/entity-permission-toggle';
import type { EntityType, EntityAction } from '@/lib/generated/prisma/client';
import { AnimatedTableBody } from '@/components/ui/animated-table-body';
import { AnimatedRow } from '@/components/ui/animated-row';

const ENTITIES: { value: EntityType; label: string }[] = [
  { value: 'STAFF', label: 'Персонал' },
  { value: 'DEPARTMENT', label: 'Кафедра' },
  { value: 'FACULTY', label: 'Факультет' },
];

const ACTIONS: { value: EntityAction; label: string }[] = [
  { value: 'CREATE', label: 'Створювати' },
  { value: 'UPDATE', label: 'Редагувати' },
  { value: 'DELETE', label: 'Видаляти' },
];

export default async function EntityPermissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ division?: string }>;
}) {
  const session = await auth();
  if (!session) redirect('/login');
  if (session.user.role !== 'ADMIN') redirect('/');

  const divisions = await db.division.findMany({ orderBy: { name: 'asc' } });
  const { division: divisionParam } = await searchParams;
  const selectedId = divisionParam ?? divisions[0]?.id;

  const grantedPerms = selectedId
    ? await db.divisionEntityPermission.findMany({
        where: { divisionId: selectedId },
        select: { entity: true, action: true },
      })
    : [];

  const granted = new Set(grantedPerms.map((p) => `${p.entity}:${p.action}`));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Дії доступу</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Які операції над сутностями редактори кожного відділу можуть виконувати
        </p>
      </div>

      {divisions.length === 0 ? (
        <div className="rounded-xl border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          Відділів не знайдено. Спочатку{' '}
          <Link href="/divisions/new" className="underline underline-offset-4">
            додайте відділ
          </Link>
          .
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {divisions.map((div) => (
              <Link
                key={div.id}
                href={`/admin/permissions/entity?division=${div.id}`}
                className={cn(
                  'rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
                  div.id === selectedId
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border text-muted-foreground hover:border-foreground hover:text-foreground'
                )}
              >
                {div.name}
              </Link>
            ))}
          </div>

          {selectedId && (
            <div className="rounded-xl border bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      Сутність
                    </th>
                    {ACTIONS.map((a) => (
                      <th
                        key={a.value}
                        className="px-4 py-3 text-center font-medium text-muted-foreground"
                      >
                        {a.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <AnimatedTableBody>
                  {ENTITIES.map((e) => (
                    <AnimatedRow key={e.value} className="border-b last:border-0">
                      <td className="px-4 py-3 font-medium">{e.label}</td>
                      {ACTIONS.map((a) => (
                        <td key={a.value} className="px-4 py-3 text-center">
                          <EntityPermissionToggle
                            divisionId={selectedId}
                            entity={e.value}
                            action={a.value}
                            checked={granted.has(`${e.value}:${a.value}`)}
                          />
                        </td>
                      ))}
                    </AnimatedRow>
                  ))}
                </AnimatedTableBody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
