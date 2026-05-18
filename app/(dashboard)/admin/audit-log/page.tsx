export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { cn } from '@/lib/utils';

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
  User: 'Користувач',
};

const FIELD_LABELS: Record<string, string> = {
  lastName: 'Прізвище',
  firstName: "Ім'я",
  patronymic: 'По батькові',
  email: 'Email',
  phone: 'Телефон',
  isNpp: 'Тип',
  employmentRate: 'Ставка',
  pedagogicalExperience: 'Пед. досвід',
  academicRank: 'Вчене звання',
  scientificDegree: 'Науковий ступінь',
  degreeMatchesDepartment: 'Відповідн. кафедрі',
  wosUrl: 'WoS',
  wosCitationCount: 'Цит. WoS',
  scopusUrl: 'Scopus',
  scopusCitationCount: 'Цит. Scopus',
  googleScholarUrl: 'Scholar',
  googleScholarCitationCount: 'Цит. Scholar',
  orcidId: 'ORCID',
  departmentId: 'Кафедра',
  divisionId: 'Відділ',
  name: 'Назва',
  deanId: 'Декан',
  facultyId: 'Факультет',
  headId: 'Завідувач',
  role: 'Роль',
  staffId: 'Співробітник',
  password: 'Пароль',
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
};

type ChangeEntry = { from: unknown; to: unknown };
type Changes = Record<string, ChangeEntry>;
type Resolve = (field: string, value: unknown) => string;

function ChangesDisplay({ changes, resolve }: { changes: Changes; resolve: Resolve }) {
  const entries = Object.entries(changes);
  if (entries.length === 0) return null;
  const visible = entries.slice(0, 8);
  const rest = entries.length - 8;

  return (
    <dl className="mt-1.5 space-y-0.5 border-t pt-1.5">
      {visible.map(([key, { from, to }]) => (
        <div
          key={key}
          className="flex flex-wrap items-baseline gap-x-1.5 text-xs text-muted-foreground"
        >
          <dt className="font-medium text-foreground/70">{FIELD_LABELS[key] ?? key}:</dt>
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
const VALID_ENTITIES = ['Staff', 'Faculty', 'Department', 'Division', 'User'];
const PAGE_SIZE = 50;

function buildHref(params: Record<string, string | undefined>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) sp.set(k, v);
  }
  const qs = sp.toString();
  return `/admin/audit-log${qs ? `?${qs}` : ''}`;
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await auth();
  if (session?.user.role !== 'ADMIN') redirect('/');

  const { action, entity, page: pageParam } = await searchParams;

  const actionFilter =
    typeof action === 'string' && VALID_ACTIONS.includes(action) ? action : undefined;
  const entityFilter =
    typeof entity === 'string' && VALID_ENTITIES.includes(entity) ? entity : undefined;
  const page = Math.max(1, parseInt(typeof pageParam === 'string' ? pageParam : '1', 10));

  const where = {
    ...(actionFilter ? { action: actionFilter } : {}),
    ...(entityFilter ? { entity: entityFilter } : {}),
  };

  const [total, logs, divisions, departments, faculties, staffList] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      where,
      include: { user: { select: { email: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.division.findMany({ select: { id: true, name: true } }),
    db.department.findMany({ select: { id: true, name: true } }),
    db.faculty.findMany({ select: { id: true, name: true } }),
    db.staff.findMany({ select: { id: true, lastName: true, firstName: true } }),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const divisionMap = new Map(divisions.map((d) => [d.id, d.name]));
  const departmentMap = new Map(departments.map((d) => [d.id, d.name]));
  const facultyMap = new Map(faculties.map((f) => [f.id, f.name]));
  const staffMap = new Map(staffList.map((s) => [s.id, `${s.lastName} ${s.firstName}`]));

  function resolve(field: string, value: unknown): string {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'boolean') return value ? 'Так' : 'Ні';
    if (value === '***') return '•••';
    const str = String(value);
    if (VALUE_LABELS[str]) return VALUE_LABELS[str];
    switch (field) {
      case 'divisionId':
        return divisionMap.get(str) ?? str;
      case 'departmentId':
        return departmentMap.get(str) ?? str;
      case 'facultyId':
        return facultyMap.get(str) ?? str;
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
        <p className="mt-0.5 text-sm text-muted-foreground">{total} записів</p>
      </div>

      <div className="space-y-2">
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
        <div className="rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Час</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Дія</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Об&apos;єкт
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Опис / Зміни
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Користувач
                </th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const changes =
                  log.changes && typeof log.changes === 'object' && !Array.isArray(log.changes)
                    ? (log.changes as Changes)
                    : null;

                return (
                  <tr
                    key={log.id}
                    className="border-b transition-colors last:border-0 hover:bg-muted/30"
                  >
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
                    <td className="px-4 py-3 align-top text-muted-foreground">
                      {ENTITY_LABELS[log.entity] ?? log.entity}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span>{log.label ?? '—'}</span>
                      {changes && <ChangesDisplay changes={changes} resolve={resolve} />}
                    </td>
                    <td className="px-4 py-3 align-top text-muted-foreground">
                      {log.user?.email ?? '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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
