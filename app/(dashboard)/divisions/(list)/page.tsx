import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { auth } from '@/lib/auth';
import {
  listDivisionRows,
  parseDivisionSort,
  type DivisionSort,
} from '@/lib/queries/list-divisions';
import { parseSortDir } from '@/lib/queries/sort';
import { Button } from '@/components/aurora/ui/button';
import { ListHeader } from '@/components/aurora/ui/list-header';
import { SortHead, TableHead, TableRow } from '@/components/aurora/ui/table';
import { DivisionTable } from '@/components/division/division-table';
import { UK } from '@/lib/plural';

export default async function DivisionsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { sort, dir } = await searchParams;
  const session = await auth();
  if (!session) redirect('/login');

  const role = session.user.role;

  // Divisions ARE the permission model — this page and the detail behind it list
  // which fields and actions each division holds, which is what someone would
  // read before trying to widen their own. ADMIN only, like creating one.
  if (role !== 'ADMIN') redirect('/');

  const sortField = parseDivisionSort(sort);
  const sortDir = parseSortDir(dir);
  const divisions = await listDivisionRows({ sort: sortField, dir: sortDir });

  const staffTotal = divisions.reduce((sum, d) => sum + d._count.staff, 0);

  /** See `/faculties` — same rule: flip the active column, start any other one ascending. */
  function buildHref(col: DivisionSort) {
    const nextDir = sortField === col && sortDir === 'asc' ? 'desc' : 'asc';
    const sp = new URLSearchParams();
    if (col !== 'name') sp.set('sort', col);
    if (nextDir !== 'asc') sp.set('dir', nextDir);
    const qs = sp.toString();
    return `/divisions${qs ? `?${qs}` : ''}`;
  }

  const head = (
    <TableRow>
      <SortHead
        label="Назва"
        href={buildHref('name')}
        active={sortField === 'name'}
        dir={sortDir}
      />
      <SortHead
        label="Співробітники"
        align="center"
        href={buildHref('staff')}
        active={sortField === 'staff'}
        dir={sortDir}
      />
      {/* Not sortable. «4 поля · 2 операції» is two figures in one cell, and a
          column that sorts has to sort on ONE of them — whichever were chosen,
          half the clicks would re-order the list by the number the reader was
          not looking at. */}
      <TableHead>Дозволи</TableHead>
      <TableHead align="center">Дії</TableHead>
    </TableRow>
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <ListHeader
        title="Відділи"
        subtitle={`${UK.record(divisions.length)} · ${UK.person(staffTotal)}`}
        actions={
          <Button asChild>
            <Link href="/divisions/new">
              <Plus />
              Додати відділ
            </Link>
          </Button>
        }
      />

      {/* `showActions` is unconditional: the page is ADMIN-only, and ADMIN is
          who deletes a відділ. */}
      <DivisionTable divisions={divisions} head={head} showActions fill />
    </div>
  );
}
