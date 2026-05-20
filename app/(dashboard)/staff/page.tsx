import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { listStaff } from '@/lib/queries/list-staff';
import { listDepartments } from '@/lib/queries/list-departments';
import { listFaculties } from '@/lib/queries/list-faculties';
import { getEditorEntityPermissions } from '@/lib/queries/get-editor-permissions';
import { Button } from '@/components/ui/button';
import { SortTh } from '@/components/ui/sort-th';
import { StaffFilters } from '@/components/staff/staff-filters';
import { StaffTable } from '@/components/staff/staff-table';
import { cn } from '@/lib/utils';
import type { AcademicRank, ScientificDegree } from '@/lib/generated/prisma/client';

const VALID_SORTS = ['lastName', 'email', 'academicRank', 'department', 'employmentRate'] as const;
type SortField = (typeof VALID_SORTS)[number];

const VALID_RANKS = new Set<string>(['LECTURER', 'SENIOR_LECTURER', 'DOCENT', 'PROFESSOR']);
const VALID_DEGREES = new Set<string>(['CANDIDATE', 'DOCTOR']);

const TABS = [
  { label: 'Всі', value: undefined },
  { label: 'НПП', value: 'npp' },
  { label: 'Адміністративний', value: 'admin' },
] as const;

export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const session = await auth();
  const role = session?.user.role;

  if (role === 'USER') redirect('/profile');

  const isAdmin = role === 'ADMIN';

  const { type, sort, dir, q, faculty, dept, rank, degree, partTime, degreeMatch } = params;

  const typeFilter = type === 'npp' || type === 'admin' ? type : undefined;
  const sortField: SortField =
    typeof sort === 'string' && (VALID_SORTS as readonly string[]).includes(sort)
      ? (sort as SortField)
      : 'lastName';
  const effectiveSortField: SortField =
    sortField === 'employmentRate' && !isAdmin ? 'lastName' : sortField;
  const sortDir = dir === 'desc' ? 'desc' : 'asc';

  const isNpp = typeFilter === 'npp' ? true : typeFilter === 'admin' ? false : undefined;
  const rankFilter =
    typeof rank === 'string' && VALID_RANKS.has(rank) ? (rank as AcademicRank) : undefined;
  const degreeFilter =
    typeof degree === 'string' && VALID_DEGREES.has(degree)
      ? (degree as ScientificDegree)
      : undefined;

  const [staff, faculties, departments] = await Promise.all([
    listStaff({
      isNpp,
      sort: effectiveSortField,
      dir: sortDir,
      q: typeof q === 'string' ? q : undefined,
      facultyId: typeof faculty === 'string' ? faculty : undefined,
      departmentId: typeof dept === 'string' ? dept : undefined,
      rank: rankFilter,
      degree: degreeFilter,
      partTime: partTime === '1',
      degreeMatch: degreeMatch === '1',
    }),
    listFaculties(),
    listDepartments(),
  ]);

  let canCreate = isAdmin;
  if (!canCreate && role === 'EDITOR') {
    const perms = await getEditorEntityPermissions(session?.user.staffId ?? '', 'STAFF');
    canCreate = perms.canCreate;
  }

  function buildHref(overrides: Record<string, string | undefined>) {
    const sp = new URLSearchParams();
    const base: Record<string, string | undefined> = {
      type: typeFilter,
      sort: effectiveSortField !== 'lastName' ? effectiveSortField : undefined,
      dir: sortDir !== 'asc' ? sortDir : undefined,
      q: typeof q === 'string' ? q : undefined,
      faculty: typeof faculty === 'string' ? faculty : undefined,
      dept: typeof dept === 'string' ? dept : undefined,
      rank: rankFilter,
      degree: degreeFilter,
      partTime: partTime === '1' ? '1' : undefined,
      degreeMatch: degreeMatch === '1' ? '1' : undefined,
    };
    for (const [k, v] of Object.entries({ ...base, ...overrides })) {
      if (v) sp.set(k, v);
    }
    const qs = sp.toString();
    return `/staff${qs ? `?${qs}` : ''}`;
  }

  const sortHeader = (
    <tr className="border-b bg-muted/40">
      <SortTh
        label="ПІБ"
        href={buildHref({
          sort: 'lastName',
          dir: effectiveSortField === 'lastName' && sortDir === 'asc' ? 'desc' : 'asc',
        })}
        active={effectiveSortField === 'lastName'}
        dir={sortDir}
      />
      <SortTh
        label="Email"
        href={buildHref({
          sort: 'email',
          dir: effectiveSortField === 'email' && sortDir === 'asc' ? 'desc' : 'asc',
        })}
        active={effectiveSortField === 'email'}
        dir={sortDir}
      />
      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Тип</th>
      <SortTh
        label="Кафедра / Відділ"
        href={buildHref({
          sort: 'department',
          dir: effectiveSortField === 'department' && sortDir === 'asc' ? 'desc' : 'asc',
        })}
        active={effectiveSortField === 'department'}
        dir={sortDir}
      />
      <SortTh
        label="Вчене звання"
        href={buildHref({
          sort: 'academicRank',
          dir: effectiveSortField === 'academicRank' && sortDir === 'asc' ? 'desc' : 'asc',
        })}
        active={effectiveSortField === 'academicRank'}
        dir={sortDir}
      />
      {isAdmin && (
        <SortTh
          label="Ставка"
          href={buildHref({
            sort: 'employmentRate',
            dir: effectiveSortField === 'employmentRate' && sortDir === 'asc' ? 'desc' : 'asc',
          })}
          active={effectiveSortField === 'employmentRate'}
          dir={sortDir}
        />
      )}
    </tr>
  );

  // Key changes with every filter/sort combination so the table animates in fresh
  const tableKey = [
    typeFilter,
    effectiveSortField,
    sortDir,
    q,
    faculty,
    dept,
    rank,
    degree,
    partTime,
    degreeMatch,
  ].join('|');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Персонал</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{staff.length} записів</p>
        </div>
        {canCreate && (
          <Button asChild>
            <Link href="/staff/new">Додати</Link>
          </Button>
        )}
      </div>

      <div className="flex w-fit gap-1 rounded-lg bg-muted p-1">
        {TABS.map((tab) => {
          const isActive = typeFilter === tab.value || (!typeFilter && tab.value === undefined);
          return (
            <Link
              key={tab.label}
              href={buildHref({ type: tab.value })}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      <StaffFilters
        faculties={faculties.map((f) => ({ id: f.id, name: f.name }))}
        departments={departments.map((d) => ({ id: d.id, name: d.name, facultyId: d.facultyId }))}
      />

      <StaffTable
        key={tableKey}
        staff={isAdmin ? staff : staff.map(({ employmentRate: _r, ...rest }) => rest)}
        sortHeader={sortHeader}
        isAdmin={isAdmin}
      />
    </div>
  );
}
