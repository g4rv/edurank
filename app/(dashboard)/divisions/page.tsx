import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Pencil } from 'lucide-react';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { DeleteDivisionButton } from '@/components/division/delete-button';

export default async function DivisionsPage() {
  const session = await auth();
  const role = session?.user.role;

  if (role === 'USER') redirect('/profile');

  const divisions = await db.division.findMany({
    select: {
      id: true,
      name: true,
      _count: { select: { staff: true } },
    },
    orderBy: { name: 'asc' },
  });

  const isAdmin = role === 'ADMIN';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Відділи</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{divisions.length} записів</p>
        </div>
        {isAdmin && (
          <Button asChild>
            <Link href="/divisions/new">Додати</Link>
          </Button>
        )}
      </div>

      {divisions.length === 0 ? (
        <div className="rounded-xl border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          Відділів не знайдено
        </div>
      ) : (
        <div className="rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Назва</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Співробітників
                </th>
                {isAdmin && (
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Дії</th>
                )}
              </tr>
            </thead>
            <tbody>
              {divisions.map((division) => (
                <tr
                  key={division.id}
                  className="border-b transition-colors last:border-0 hover:bg-muted/30"
                >
                  <td className="px-4 py-3 font-medium">
                    <Link
                      href={`/divisions/${division.id}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {division.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{division._count.staff}</td>
                  {isAdmin && (
                    <td className="px-4 py-3">
                      <div className="flex items-start justify-end gap-2">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/divisions/${division.id}/edit`}>
                            <Pencil className="size-4" />
                          </Link>
                        </Button>
                        <DeleteDivisionButton
                          divisionId={division.id}
                          divisionName={division.name}
                        />
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
