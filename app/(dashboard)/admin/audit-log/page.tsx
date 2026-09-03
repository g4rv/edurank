export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { cn } from '@/lib/utils';
import {
  ENTITY_FIELD_LABELS,
  FIELD_LABELS,
  STUDENT_DEGREE_LABELS,
  STUDENT_FUNDING_LABELS,
  STUDY_FORM_LABELS,
} from '@/lib/labels';
import { formatStake } from '@/lib/stake/units';
import { SortTh } from '@/components/ui/sort-th';
import { AnimatedTableBody } from '@/components/ui/animated-table-body';
import { AnimatedRow } from '@/components/ui/animated-row';
import { DataTable } from '@/components/ui/data-table';
import { AuditDateFilter } from '@/components/admin/audit-date-filter';
import { UK } from '@/lib/plural';

const ACTION_LABELS: Record<string, string> = {
  CREATE: 'Створено',
  UPDATE: 'Оновлено',
  DELETE: 'Видалено',
};

const ACTION_CLASSES: Record<string, string> = {
  CREATE: 'bg-green-500/10 text-green-600',
  UPDATE: 'bg-blue-500/10 text-blue-600',
  DELETE: 'bg-red-500/10 text-red-600',
};

const ENTITY_LABELS: Record<string, string> = {
  Staff: 'Персонал',
  Faculty: 'Факультет',
  Department: 'Кафедра',
  Division: 'Відділ',
  Activity: 'Досягнення',
  RatingTemplate: 'Рейтинговий рік',
  ActivityType: 'Показник рейтингу',
  AdmittedStudent: 'Здобувач',
};

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
  // Реєстр зарахованих. Spread from the shared maps rather than retyped, so a
  // diff and the register page cannot disagree about what «Заочна» is called.
  ...STUDENT_DEGREE_LABELS,
  ...STUDY_FORM_LABELS,
  ...STUDENT_FUNDING_LABELS,
};

type ChangeEntry = { from: unknown; to: unknown };
type Changes = Record<string, ChangeEntry>;
type Resolve = (field: string, value: unknown) => string;

function ChangesDisplay({
  changes,
  entity,
  resolve,
}: {
  changes: Changes;
  entity: string;
  resolve: Resolve;
}) {
  const entries = Object.entries(changes);
  if (entries.length === 0) return null;
  const visible = entries.slice(0, 8);
  const rest = entries.length - 8;

  return (
    <dl className="space-y-0.5">
      {visible.map(([key, { from, to }]) => (
        <div
          key={key}
          className="flex flex-wrap items-baseline gap-x-1.5 text-xs text-muted-foreground"
        >
          <dt className="font-medium text-foreground/70">
            {ENTITY_FIELD_LABELS[entity]?.[key] ?? FIELD_LABELS[key] ?? key}:
          </dt>
          <dd className="flex items-baseline gap-1">
            {from !== null && <span>{resolve(key, from)}</span>}
            {from !== null && to !== null && <span className="text-muted-foreground/50">→</span>}
            {to !== null && <span>{resolve(key, to)}</span>}
          </dd>
        </div>
      ))}
      {rest > 0 && <div className="text-xs text-muted-foreground/60">+{rest} полів</div>}
    </dl>
  );
}

const VALID_ACTIONS = ['CREATE', 'UPDATE', 'DELETE'];
const VALID_ENTITIES = [
  'Staff',
  'Faculty',
  'Department',
  'Division',
  'Activity',
  'RatingTemplate',
  'ActivityType',
  'AdmittedStudent',
];
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
    action,
    entity,
    page: pageParam,
    dir,
    sort,
    from: fromParam,
    to: toParam,
  } = await searchParams;

  const actionFilter =
    typeof action === 'string' && VALID_ACTIONS.includes(action) ? action : undefined;
  const entityFilter =
    typeof entity === 'string' && VALID_ENTITIES.includes(entity) ? entity : undefined;
  const fromFilter = typeof fromParam === 'string' && fromParam ? fromParam : undefined;
  const toFilter = typeof toParam === 'string' && toParam ? toParam : undefined;
  const page = Math.max(1, parseInt(typeof pageParam === 'string' ? pageParam : '1', 10));
  const sortField = sort === 'author' ? 'author' : 'createdAt';
  const sortDir = dir === 'asc' ? 'asc' : 'desc';

  function buildHref(overrides: Record<string, string | undefined>) {
    const sp = new URLSearchParams();
    const base: Record<string, string | undefined> = {
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

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const divisionMap = new Map(divisions.map((d) => [d.id, d.name]));
  const departmentMap = new Map(departments.map((d) => [d.id, d.name]));
  const facultyMap = new Map(faculties.map((f) => [f.id, f.name]));
  const staffMap = new Map(
    staffList.map((s) => [s.id, `${s.lastName} ${s.firstName} ${s.patronymic}`])
  );
  const specialityMap = new Map(specialities.map((s) => [s.id, s.name]));
  function resolveEntityName(entity: string, entityId: string): string | null {
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

  function resolve(field: string, value: unknown): string {
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Журнал аудиту</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{UK.record(total)}</p>
      </div>

      <div className="space-y-3">
        <AuditDateFilter from={fromFilter ?? ''} to={toFilter ?? ''} />

        <div className="flex w-fit gap-1 rounded-lg bg-muted p-1">
          {([undefined, ...VALID_ACTIONS] as (string | undefined)[]).map((a) => (
            <Link
              key={a ?? 'all'}
              href={buildHref({ action: a, entity: entityFilter })}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                actionFilter === a
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {a ? ACTION_LABELS[a] : 'Всі дії'}
            </Link>
          ))}
        </div>

        <div className="flex w-fit gap-1 rounded-lg bg-muted p-1">
          {([undefined, ...VALID_ENTITIES] as (string | undefined)[]).map((e) => (
            <Link
              key={e ?? 'all'}
              href={buildHref({ action: actionFilter, entity: e })}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                entityFilter === e
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {e ? ENTITY_LABELS[e] : "Всі об'єкти"}
            </Link>
          ))}
        </div>
      </div>

      {logs.length === 0 ? (
        <div className="rounded-xl border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          Записів не знайдено
        </div>
      ) : (
        <DataTable>
          <thead>
            <tr className="border-b bg-muted/40">
              <SortTh
                label="Час"
                href={buildHref({
                  sort: 'createdAt',
                  dir: sortField === 'createdAt' ? (sortDir === 'desc' ? 'asc' : 'desc') : 'desc',
                })}
                active={sortField === 'createdAt'}
                dir={sortDir as 'asc' | 'desc'}
              />
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Дія</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Об&apos;єкт</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Зміни</th>
              <SortTh
                label="Користувач"
                href={buildHref({
                  sort: 'author',
                  dir: sortField === 'author' ? (sortDir === 'asc' ? 'desc' : 'asc') : 'asc',
                })}
                active={sortField === 'author'}
                dir={sortDir as 'asc' | 'desc'}
              />
            </tr>
          </thead>
          <AnimatedTableBody>
            {logs.map((log) => {
              const changes =
                log.changes && typeof log.changes === 'object' && !Array.isArray(log.changes)
                  ? (log.changes as Changes)
                  : null;

              return (
                <AnimatedRow key={log.id} className="transition-colors">
                  <td className="px-4 py-3 align-top whitespace-nowrap text-muted-foreground">
                    {new Date(log.createdAt).toLocaleString('uk-UA')}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                        ACTION_CLASSES[log.action] ?? 'bg-muted text-muted-foreground'
                      )}
                    >
                      {ACTION_LABELS[log.action] ?? log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <span className="text-xs text-muted-foreground">
                      {ENTITY_LABELS[log.entity] ?? log.entity}
                    </span>
                    {(() => {
                      const name = resolveEntityName(log.entity, log.entityId) ?? log.label;
                      return name ? <p className="mt-0.5 text-sm font-medium">{name}</p> : null;
                    })()}
                  </td>
                  <td className="px-4 py-3 align-top">
                    {changes ? (
                      <ChangesDisplay changes={changes} entity={log.entity} resolve={resolve} />
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top text-muted-foreground">
                    {log.user?.email ?? '—'}
                  </td>
                </AnimatedRow>
              );
            })}
          </AnimatedTableBody>
        </DataTable>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Сторінка {page} з {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={buildHref({
                  action: actionFilter,
                  entity: entityFilter,
                  page: String(page - 1),
                })}
                className="rounded-md border bg-card px-3 py-1.5 text-foreground transition-colors hover:bg-muted/50"
              >
                ← Попередня
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={buildHref({
                  action: actionFilter,
                  entity: entityFilter,
                  page: String(page + 1),
                })}
                className="rounded-md border bg-card px-3 py-1.5 text-foreground transition-colors hover:bg-muted/50"
              >
                Наступна →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
