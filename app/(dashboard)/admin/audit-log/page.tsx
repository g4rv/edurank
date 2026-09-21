export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { STUDENT_DEGREE_LABELS, STUDENT_FUNDING_LABELS, STUDY_FORM_LABELS } from '@/lib/labels';
import { formatStake } from '@/lib/stake/units';
import { AUDIT_ACTIONS, AUDIT_ENTITIES } from '@/lib/audit/describe';
import { ListHeader } from '@/components/aurora/ui/list-header';
import { Pagination } from '@/components/aurora/ui/pagination';
import { SortHead, TableHead, TableRow } from '@/components/aurora/ui/table';
import { AuditFilters } from '@/components/admin/audit-filters';
import { AuditLogTable } from '@/components/admin/audit-log-table';
import { UK } from '@/lib/plural';

const VALUE_LABELS: Record<string, string> = {
  LECTURER: 'Викладач',
  SENIOR_LECTURER: 'Старший викладач',
  DOCENT: 'Доцент',
  PROFESSOR: 'Професор',
  CANDIDATE: 'Кандидат наук',
  DOCTOR: 'Доктор наук',
  ADMIN: 'Адміністратор',
  EDITOR: 'Редактор',
  USER: 'Користувач',
  // Статуси, які раніше друкувались англійською просто тому, що їх тут не було
  // (owner, 2026-09-21). Every one of these reaches the diff through a `status`
  // field, which is the commonest thing in the log after a name.
  PENDING: 'На розгляді',
  APPROVED: 'Зараховано',
  REMOVED: 'Відхилено',
  CONFIRMED: 'Підтверджено',
  REJECTED: 'Відхилено',
  DRAFT: 'Чернетка',
  ACTIVE: 'Активний',
  CLOSED: 'Закритий',
  OPEN: 'Відкритий',
  LOCKED: 'Подано',
  NPP_SUBMISSION: 'Самостійне подання',
  DIVISION_MANAGED: 'Вносить відділ',
  PROFILE_DERIVED: 'З профілю',
  ONCE: 'Один раз назавжди',
  YEARLY: 'Щороку заново',
  SHARED: 'Спільна',
  INDIVIDUAL: 'Індивідуальна',
  // Реєстр зарахованих. Spread from the shared maps rather than retyped, so a
  // diff and the register page cannot disagree about what «Заочна» is called.
  ...STUDENT_DEGREE_LABELS,
  ...STUDY_FORM_LABELS,
  ...STUDENT_FUNDING_LABELS,
};

const PAGE_SIZE = 50;

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await auth();
  if (!session) redirect('/login');
  if (session.user.role !== 'ADMIN') redirect('/');

  const {
    q,
    action,
    entity,
    page: pageParam,
    dir,
    sort,
    from: fromParam,
    to: toParam,
  } = await searchParams;

  const search = typeof q === 'string' ? q.trim() : '';
  const actionFilter =
    typeof action === 'string' && (AUDIT_ACTIONS as readonly string[]).includes(action)
      ? action
      : undefined;
  const entityFilter =
    typeof entity === 'string' && AUDIT_ENTITIES.includes(entity) ? entity : undefined;
  const fromFilter = typeof fromParam === 'string' && fromParam ? fromParam : undefined;
  const toFilter = typeof toParam === 'string' && toParam ? toParam : undefined;
  const page = Math.max(1, parseInt(typeof pageParam === 'string' ? pageParam : '1', 10));
  const sortField = sort === 'author' ? 'author' : 'createdAt';
  const sortDir = dir === 'asc' ? 'asc' : 'desc';

  function buildHref(overrides: Record<string, string | undefined>) {
    const sp = new URLSearchParams();
    const base: Record<string, string | undefined> = {
      q: search || undefined,
      action: actionFilter,
      entity: entityFilter,
      from: fromFilter,
      to: toFilter,
      sort: sortField !== 'createdAt' ? sortField : undefined,
      dir: sortDir !== 'desc' ? sortDir : undefined,
    };
    for (const [k, v] of Object.entries({ ...base, ...overrides })) {
      if (v) sp.set(k, v);
    }
    const qs = sp.toString();
    return `/admin/audit-log${qs ? `?${qs}` : ''}`;
  }

  const fromDate = fromFilter ? new Date(`${fromFilter}T00:00:00.000Z`) : undefined;
  const toDate = toFilter ? new Date(`${toFilter}T23:59:59.999Z`) : undefined;

  const where = {
    ...(actionFilter ? { action: actionFilter } : {}),
    ...(entityFilter ? { entity: entityFilter } : {}),
    // «Хто це змінив» is what the log is FOR, and there was no way to ask it.
    // The label is the entry's own name for the record; the email is the author.
    ...(search
      ? {
          OR: [
            { label: { contains: search, mode: 'insensitive' as const } },
            { user: { email: { contains: search, mode: 'insensitive' as const } } },
          ],
        }
      : {}),
    ...(fromDate || toDate
      ? {
          createdAt: { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) },
        }
      : {}),
  };

  const orderBy =
    sortField === 'author'
      ? { user: { email: sortDir as 'asc' | 'desc' } }
      : { createdAt: sortDir as 'asc' | 'desc' };

  const [total, logs, divisions, departments, faculties, staffList, specialities] =
    await Promise.all([
      db.auditLog.count({ where }),
      db.auditLog.findMany({
        where,
        include: { user: { select: { email: true } } },
        orderBy,
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      db.division.findMany({ select: { id: true, name: true } }),
      db.department.findMany({ select: { id: true, name: true } }),
      db.faculty.findMany({ select: { id: true, name: true } }),
      db.staff.findMany({
        select: { id: true, lastName: true, firstName: true, patronymic: true },
      }),
      db.speciality.findMany({ select: { id: true, name: true } }),
    ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const divisionMap = new Map(divisions.map((d) => [d.id, d.name]));
  const departmentMap = new Map(departments.map((d) => [d.id, d.name]));
  const facultyMap = new Map(faculties.map((f) => [f.id, f.name]));
  const staffMap = new Map(
    staffList.map((s) => [s.id, `${s.lastName} ${s.firstName} ${s.patronymic}`])
  );
  const specialityMap = new Map(specialities.map((s) => [s.id, s.name]));

  function resolveName(entity: string, entityId: string): string | null {
    switch (entity) {
      case 'Staff':
        return staffMap.get(entityId) ?? null;
      case 'Department':
        return departmentMap.get(entityId) ?? null;
      case 'Faculty':
        return facultyMap.get(entityId) ?? null;
      case 'Division':
        return divisionMap.get(entityId) ?? null;
      default:
        return null;
    }
  }

  function resolveValue(field: string, value: unknown): string {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'boolean') return value ? 'Так' : 'Ні';
    if (value === '***') return '•••';
    const str = String(value);
    if (VALUE_LABELS[str]) return VALUE_LABELS[str];
    switch (field) {
      // Every ставка in the database is INTEGER HUNDREDTHS. Printing the raw
      // 105 made an ordinary edit look like a broken one, and left the reader
      // doing the division themselves. The labels no longer say «(сотих)»
      // because the value now says it (2026-08-24).
      case 'kstHundredths':
      case 'minHundredths':
      case 'maxHundredths':
      case 'bonusPoolHundredths':
      case 'valueHundredths':
        return Number.isFinite(Number(value)) ? formatStake(Number(value)) : str;
      // Dates reach the JSON column as ISO strings, and printing one raw put
      // «2019-05-12T00:00:00.000Z» in a column a person reads. `archivedAt` has
      // always been stored that way; `degreeDefenceDate` joins it now that its
      // before-value is read at all (2026-08-28).
      //
      // Кафедра п.5's defence date is a DATE — stored as UTC midnight, so it is
      // formatted in UTC or a negative offset shows the day before. `archivedAt`
      // is an instant and keeps its time.
      case 'degreeDefenceDate': {
        const d = new Date(str);
        return Number.isNaN(d.getTime()) ? str : d.toLocaleDateString('uk-UA', { timeZone: 'UTC' });
      }
      case 'archivedAt': {
        const d = new Date(str);
        return Number.isNaN(d.getTime()) ? str : d.toLocaleString('uk-UA');
      }
      case 'divisionId':
        return divisionMap.get(str) ?? str;
      case 'departmentId':
        return departmentMap.get(str) ?? str;
      case 'facultyId':
        return facultyMap.get(str) ?? str;
      case 'specialityId':
        return specialityMap.get(str) ?? str;
      case 'headId':
      case 'deanId':
      case 'staffId':
        return staffMap.get(str) ?? str;
    }
    return str;
  }

  const head = (
    <TableRow>
      <SortHead
        label="Час"
        href={buildHref({
          sort: 'createdAt',
          dir: sortField === 'createdAt' && sortDir === 'desc' ? 'asc' : 'desc',
          page: undefined,
        })}
        active={sortField === 'createdAt'}
        dir={sortDir}
      />
      <TableHead>Дія</TableHead>
      <TableHead>Об&apos;єкт</TableHead>
      <TableHead>Зміни</TableHead>
      <SortHead
        label="Користувач"
        href={buildHref({
          sort: 'author',
          dir: sortField === 'author' && sortDir === 'asc' ? 'desc' : 'asc',
          page: undefined,
        })}
        active={sortField === 'author'}
        dir={sortDir}
      />
    </TableRow>
  );

  // In the table card's own footer strip, pinned under the rows — loose below
  // the card it is the one piece of furniture the height budget does not know
  // about, so a short viewport scrolls the page to reach it.
  const pager = totalPages > 1 && (
    <tr>
      <td colSpan={5} className="px-4 py-2">
        <Pagination
          page={page}
          totalPages={totalPages}
          align="center"
          hrefFor={(p) => buildHref({ page: p > 1 ? String(p) : undefined })}
          summary={
            <>
              Стор. {page} з {totalPages}
            </>
          }
        />
      </td>
    </tr>
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <ListHeader
        title="Журнал аудиту"
        subtitle={UK.record(total)}
        filters={
          <AuditFilters
            q={search}
            action={actionFilter ?? ''}
            entity={entityFilter ?? ''}
            from={fromFilter ?? ''}
            to={toFilter ?? ''}
          />
        }
      />

      <AuditLogTable
        entries={logs}
        head={head}
        footer={pager || undefined}
        resolveName={resolveName}
        resolveValue={resolveValue}
      />
    </div>
  );
}
