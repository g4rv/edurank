import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { listStaff, type StaffListItem } from '@/lib/queries/list-staff';
import { listDepartments } from '@/lib/queries/list-departments';
import { listFaculties } from '@/lib/queries/list-faculties';
import { Button } from '@/components/ui/button';
import { SortTh } from '@/components/ui/sort-th';
import { StaffFilters } from '@/components/staff/staff-filters';
import { cn } from '@/lib/utils';
import type { AcademicRank, ScientificDegree } from '@/lib/generated/prisma/client';

const ACADEMIC_RANK_LABELS: Record<AcademicRank, string> = {
  LECTURER: 'Викладач',
  SENIOR_LECTURER: 'Старший викладач',
  DOCENT: 'Доцент',
  PROFESSOR: 'Професор',
};

const SCIENTIFIC_DEGREE_LABELS: Record<ScientificDegree, string> = {
  CANDIDATE: 'Кандидат наук',
  DOCTOR: 'Доктор наук',
};

const VALID_SORTS = ['lastName', 'email', 'academicRank', 'department'] as const;
type SortField = (typeof VALID_SORTS)[number];

const VALID_RANKS = new Set<string>(['LECTURER', 'SENIOR_LECTURER', 'DOCENT', 'PROFESSOR']);
const VALID_DEGREES = new Set<string>(['CANDIDATE', 'DOCTOR']);

const TABS = [
  { label: 'Всі', value: undefined },
  { label: 'НПП', value: 'npp' },
  { label: 'Адміністративний', value: 'admin' },
] as const;

function fullName(s: Pick<StaffListItem, 'lastName' | 'firstName' | 'patronymic'>) {
  return `${s.lastName} ${s.firstName} ${s.patronymic}`;
}

export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const session = await auth();
  const role = session?.user.role;

  if (role === 'USER') redirect('/profile');

  const { type, sort, dir, q, faculty, dept, rank, degree, partTime, degreeMatch } = params;

  const typeFilter = type === 'npp' || type === 'admin' ? type : undefined;
  const sortField: SortField =
    typeof sort === 'string' && (VALID_SORTS as readonly string[]).includes(sort)
      ? (sort as SortField)
      : 'lastName';
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
      sort: sortField,
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

  const isAdmin = role === 'ADMIN';

  let canCreate = isAdmin;
  if (!canCreate && role === 'EDITOR') {
    const editorStaff = await db.staff.findUnique({
      where: { id: session?.user.staffId ?? '' },
      select: { divisionId: true },
    });
    if (editorStaff?.divisionId) {
      const permission = await db.divisionEntityPermission.findFirst({
        where: { divisionId: editorStaff.divisionId, entity: 'STAFF', action: 'CREATE' },
      });
      canCreate = !!permission;
    }
  }

  function buildHref(overrides: Record<string, string | undefined>) {
    const sp = new URLSearchParams();
    const base: Record<string, string | undefined> = {
      type: typeFilter,
      sort: sortField !== 'lastName' ? sortField : undefined,
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

      {staff.length === 0 ? (
        <div className="rounded-xl border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          Записів не знайдено
        </div>
      ) : (
        <div className="rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <SortTh
                  label="ПІБ"
                  href={buildHref({
                    sort: 'lastName',
                    dir: sortField === 'lastName' && sortDir === 'asc' ? 'desc' : 'asc',
                  })}
                  active={sortField === 'lastName'}
                  dir={sortDir}
                />
                <SortTh
                  label="Email"
                  href={buildHref({
                    sort: 'email',
                    dir: sortField === 'email' && sortDir === 'asc' ? 'desc' : 'asc',
                  })}
                  active={sortField === 'email'}
                  dir={sortDir}
                />
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Тип</th>
                <SortTh
                  label="Кафедра / Відділ"
                  href={buildHref({
                    sort: 'department',
                    dir: sortField === 'department' && sortDir === 'asc' ? 'desc' : 'asc',
                  })}
                  active={sortField === 'department'}
                  dir={sortDir}
                />
                <SortTh
                  label="Вчене звання"
                  href={buildHref({
                    sort: 'academicRank',
                    dir: sortField === 'academicRank' && sortDir === 'asc' ? 'desc' : 'asc',
                  })}
                  active={sortField === 'academicRank'}
                  dir={sortDir}
                />
              </tr>
            </thead>
            <tbody>
              {staff.map((member) => (
                <tr
                  key={member.id}
                  className="relative border-b transition-colors last:border-0 hover:bg-muted/30"
                >
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/staff/${member.id}`} className="absolute inset-0" />
                    {fullName(member)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{member.email}</td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                        member.isNpp
                          ? 'bg-primary/10 text-primary'
                          : 'bg-muted text-muted-foreground'
                      )}
                    >
                      {member.isNpp ? 'НПП' : 'Адм.'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {member.department?.name ?? member.division?.name ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {member.academicRank
                      ? [
                          ACADEMIC_RANK_LABELS[member.academicRank],
                          member.scientificDegree
                            ? SCIENTIFIC_DEGREE_LABELS[member.scientificDegree]
                            : null,
                        ]
                          .filter(Boolean)
                          .join(', ')
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
