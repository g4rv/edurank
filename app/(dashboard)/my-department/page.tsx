import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getActiveTemplate } from '@/lib/queries/get-active-template';
import { listMyDepartments } from '@/lib/queries/list-my-department';
import { deanOf } from '@/lib/queries/scope';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { getDepartmentsKnpp } from '@/lib/queries/get-department-knpp';
import { ACADEMIC_RANK_LABELS, SCIENTIFIC_DEGREE_LABELS } from '@/lib/labels';
import { KnppSummary } from '@/components/kharakterystyka/knpp-summary';
import { Scale, UserPlus } from 'lucide-react';
import { Badge } from '@/components/aurora/ui/badge';
import { Button } from '@/components/aurora/ui/button';
import { EmptyState } from '@/components/aurora/ui/card';
import { ListHeader } from '@/components/aurora/ui/list-header';
import { Table, TableBody, TableCell, TableHead, TableRow } from '@/components/aurora/ui/table';
import { DownloadButton } from '@/components/ui/download-button';
import { RowLinkCell } from '@/components/ui/row-link-cell';
import { cn } from '@/lib/utils';
import { formatStake } from '@/lib/stake/units';

/**
 * A завідувач's (or декан's) view of their own people.
 *
 * Headship is derived from `Department.headId`, not from a `Role` — one person
 * is routinely a head, an НПП and a division editor at once (decided
 * 2026-08-04, Q5/Q14). Since a head is usually an ordinary `USER`, `/staff` is
 * closed to them, and this is how they reach the records they are entitled to
 * read.
 *
 * Deliberately read-only. The head's one editing job is the ставка
 * distribution, and that grid is a separate feature.
 */
export default async function MyDepartmentPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const session = await auth();
  if (!session) redirect('/login');

  const template = await getActiveTemplate();
  const [all, deanFaculties] = await Promise.all([
    listMyDepartments(session.user.staffId, template?.year ?? 0),
    deanOf(session.user.staffId),
  ]);

  // Not an error page: somebody who heads nothing simply has no business here,
  // and their own profile is where they were going.
  if (all.length === 0) redirect('/profile');

  // A декан opens ONE кафедра from «Мій факультет» (owner, 2026-09-24) — it
  // used to stack all of them here, five licence cards and five tables on one
  // 4000px page. With none chosen, their screen is the факультет's.
  const isDean = deanFaculties.length > 0;
  const asked = typeof params.department === 'string' ? params.department : null;
  if (isDean && !asked) redirect('/my-faculty');
  const departments = asked ? all.filter((d) => d.id === asked) : all;
  if (departments.length === 0) redirect(isDean ? '/my-faculty' : '/my-department');

  // Кнпп and «позицій із 20» per person, in three queries for every кафедра at
  // once rather than three per кафедра.
  const knppList = await getDepartmentsKnpp(
    departments.map((d) => d.id),
    template?.year ?? 0
  );
  const knppByDepartment = new Map(knppList.map((k) => [k.departmentId, k]));
  // Both lists: сумісники are outside `knpp` by design but they ARE in this
  // head's table, and «—» read as «no data» while /stakes/[id] showed a count.
  const positionsByStaff = new Map(
    knppList.flatMap((k) => [...k.staff, ...k.partTimeStaff].map((s) => [s.id, s] as const))
  );

  const single = departments.length === 1;

  return (
    // `flex h-full min-h-0 flex-col`: with one кафедра the table takes the
    // height that is left and its rows scroll inside it, so the page itself
    // never scrolls — `/rating`'s shape (§4, the `fill` pattern).
    <div className={cn('flex flex-col gap-4', single && 'h-full min-h-0')}>
      {/* A декан came here from their факультет, and goes back to it. */}
      {isDean && single && (
        <Breadcrumbs
          items={[{ label: 'Мій факультет', href: '/my-faculty' }, { label: departments[0].name }]}
        />
      )}
      <ListHeader
        title={isDean && single ? departments[0].name : 'Моя кафедра'}
        subtitle={
          <>
            {single && !isDean && `${departments[0].name} · `}
            {template ? `рейтинг за ${template.year} рік` : 'рейтинговий рік ще не налаштовано'}
          </>
        }
        actions={
          // The two places a head works from. They were loose «→» links under
          // the summary, which read as footnotes rather than as where this
          // page leads.
          single && template ? (
            <DepartmentLinks
              departmentId={departments[0].id}
              year={template.year}
              showHeadTools={!isDean}
            />
          ) : undefined
        }
      />

      {departments.map((department) => (
        <section
          key={department.id}
          className={cn('flex flex-col gap-4', single && 'min-h-0 flex-1')}
        >
          {!single && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">
                {department.name}
                <span className="ml-2 text-sm font-normal text-foreground-soft">
                  {department.faculty}
                </span>
              </h2>
              {template && (
                <DepartmentLinks
                  departmentId={department.id}
                  year={template.year}
                  showHeadTools={!isDean}
                />
              )}
            </div>
          )}

          {template && knppByDepartment.has(department.id) && (
            <KnppSummary data={knppByDepartment.get(department.id)!} year={template.year} />
          )}

          <StaffTable
            staff={department.staff}
            positionsByStaff={positionsByStaff}
            year={template?.year ?? null}
            fill={single}
            showStake={!isDean}
          />
        </section>
      ))}
    </div>
  );
}

function DepartmentLinks({
  departmentId,
  year,
  showHeadTools = true,
}: {
  departmentId: string;
  /** Which year's rating the export holds — said on the button. */
  year: number;
  /**
   * «Розподіл ставок» and «Залучені здобувачі» — a head's work. Off for a
   * декан (owner, 2026-09-24), who keeps only the export.
   */
  showHeadTools?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {showHeadTools && (
        <Button asChild variant="outline">
          <Link href={`/stakes/${departmentId}`}>
            <Scale className="size-4" />
            Розподіл ставок
          </Link>
        </Button>
      )}
      {showHeadTools && (
        <Button asChild variant="outline">
          <Link href={`/my-department/students?department=${departmentId}`}>
            <UserPlus className="size-4" />
            Залучені здобувачі
          </Link>
        </Button>
      )}
      {/* ПІБ, кафедра and rating as a spreadsheet — for a head and a декан
          alike (owner, 2026-09-24). */}
      <DownloadButton
        href={`/api/export/department-ratings?department=${departmentId}`}
        label={`Рейтинг кафедри ${year}`}
        title="ПІБ і рейтинг усіх НПП кафедри"
      />
    </div>
  );
}

/**
 * НПП | Звання / ступінь | Рейтинг <рік> | Ставка | Характеристика (owner,
 * 2026-09-24): the licence score and its Excel in ONE column, since both are
 * the Характеристика. «РЕЙТИНГ 2026» on one line sets its own column. Widths
 * add up (§12): 16 + 9 + 7 + 12 = 44rem declared plus a 16rem floor for the
 * ПІБ = 60rem.
 */
const COLUMNS = [null, '16rem', '9rem', '7rem', '12rem'] as const;
const MIN_WIDTH = 'calc(16rem + 16rem + 9rem + 7rem + 12rem)';
/** A декан's view: no Ставка column — розподіл ставок is not theirs. */
const DEAN_COLUMNS = [null, '16rem', '9rem', '12rem'] as const;
const DEAN_MIN_WIDTH = 'calc(16rem + 16rem + 9rem + 12rem)';

function StaffTable({
  staff,
  positionsByStaff,
  year,
  fill,
  showStake,
}: {
  staff: Awaited<ReturnType<typeof listMyDepartments>>[number]['staff'];
  positionsByStaff: Map<string, { metCount: number; qualifies: boolean }>;
  year: number | null;
  fill: boolean;
  /** Off for a декан (owner, 2026-09-24) — розподіл ставок is not theirs. */
  showStake: boolean;
}) {
  if (staff.length === 0) return <EmptyState>На кафедрі немає НПП</EmptyState>;

  return (
    <Table
      columns={showStake ? COLUMNS : DEAN_COLUMNS}
      minWidth={showStake ? MIN_WIDTH : DEAN_MIN_WIDTH}
      fill={fill}
      head={
        <TableRow>
          <TableHead>НПП</TableHead>
          <TableHead>Звання / ступінь</TableHead>
          {/* WHICH year's rating (owner, 2026-09-24) — the ставки on the next
              column are spread by a rating, and the year says which. */}
          <TableHead align="center" className="whitespace-nowrap">
            {year === null ? 'Рейтинг' : `Рейтинг ${year}`}
          </TableHead>
          {showStake && <TableHead align="center">Ставка</TableHead>}
          <TableHead align="center">Характеристика</TableHead>
        </TableRow>
      }
    >
      <TableBody>
        {staff.map((person) => (
          <TableRow key={person.id} className="[&>td]:align-middle" hoverable>
            {/* The name opens their record — read-only for a head since
                2026-09-24, all three tabs. It used to open only the
                Характеристика, which the link did not say, so a head could take
                it for their profile. */}
            <RowLinkCell
              href={`/staff/${person.id}`}
              label={`Профіль: ${person.name}`}
              after={
                // Their кафедра is elsewhere and this one also pays them a
                // ставка (2026-08-24).
                person.isPartTime ? <Badge tone="warn">Сумісник</Badge> : undefined
              }
            >
              {person.name}
            </RowLinkCell>
            <TableCell>
              {[
                person.academicRank && ACADEMIC_RANK_LABELS[person.academicRank],
                person.scientificDegree && SCIENTIFIC_DEGREE_LABELS[person.scientificDegree],
              ]
                .filter(Boolean)
                .join(', ') || '—'}
            </TableCell>
            <TableCell numeric align="center" className="font-semibold">
              {person.total}
            </TableCell>
            {/* THIS кафедра's ставка for them — the head's own saved split, the
                number on their grid. «—» until a split is saved. */}
            {showStake && (
              <TableCell numeric align="center">
                {person.stakeHundredths === null ? (
                  <span className="text-foreground-soft">—</span>
                ) : (
                  formatStake(person.stakeHundredths)
                )}
              </TableCell>
            )}
            <TableCell align="center">
              {/* The licence score and the document it comes from, side by
                  side — the head reads the one and downloads the other. */}
              <div className="flex items-center justify-center gap-2">
                <PositionCount entry={positionsByStaff.get(person.id)} />
                {year !== null && (
                  <DownloadButton
                    href={`/api/export/kharakterystyka?year=${year}&staffId=${person.id}`}
                    label="Excel"
                    title="Завантажити Характеристику (Excel)"
                    variant="ghost"
                    size="sm"
                  />
                )}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/**
 * «позицій із 20» for one person, marked when it clears the licence bar.
 *
 * Green means «counts towards Кнпп», red means it does not — a pill reporting
 * one condition, which §3 allows a hue. Neither is about pay: Кнпп is a divisor
 * inside the ставка formula and nothing else, and everybody on the кафедра
 * receives a ставка either way.
 */
function PositionCount({ entry }: { entry?: { metCount: number; qualifies: boolean } }) {
  if (!entry) return <span className="text-muted-foreground">—</span>;
  return <Badge tone={entry.qualifies ? 'ok' : 'destructive'}>{entry.metCount}/20</Badge>;
}
