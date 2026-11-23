import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { canModerateRating } from '@/lib/rating/moderation';
import { getActiveTemplate } from '@/lib/queries/get-active-template';
import { listDisciplineStandings } from '@/lib/rating/rating-gate';
import { progressText } from '@/lib/disciplines/assigned';
import { EmptyState } from '@/components/aurora/ui/card';
import { DisciplineNamesDialog } from '@/components/rating/discipline-names-dialog';

const fullName = (p: { lastName: string; firstName: string; patronymic: string | null }) =>
  `${p.lastName} ${p.firstName} ${p.patronymic ?? ''}`.trim();

/**
 * «Дисципліни 5.1» (owner, 2026-11-19): who has not answered 5.1 for every
 * discipline the departments assigned them. The year counts 0 for exactly these
 * people when it closes, so ННВ and ADMIN read this BEFORE pressing close — a
 * wrong «не лектор» is judged here, by a person, not by the system.
 *
 * Reading only: nothing on this page changes a record. Filters are plain links.
 */
type Filter = 'all' | 'missing' | 'notLecturer';

/**
 * A column of discipline names. A long list sits behind one button that opens a
 * popup (owner, 2026-11-23: one row listed eighteen) — the same dialog the
 * person's own checklist uses.
 */
function Names({ names, person, title }: { names: string[]; person: string; title: string }) {
  if (names.length === 0) return <span className="text-muted-foreground">—</span>;
  if (names.length <= 3) {
    return (
      <ul className="list-inside list-disc space-y-0.5">
        {names.map((m) => (
          <li key={m}>{m}</li>
        ))}
      </ul>
    );
  }
  return <DisciplineNamesDialog person={person} title={title} names={names} />;
}

export default async function DisciplinesPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const session = await auth();
  if (!session) redirect('/login');
  if (!(await canModerateRating(session.user))) redirect('/');

  const { show } = await searchParams;
  const filter: Filter = show === 'missing' || show === 'notLecturer' ? show : 'all';

  const template = await getActiveTemplate();
  if (!template) {
    return <EmptyState>Рейтинговий рік ще не налаштовано.</EmptyState>;
  }

  const standings = await listDisciplineStandings(db, template.year);
  const people = await db.staff.findMany({
    where: { id: { in: standings.map((s) => s.staffId) } },
    select: {
      id: true,
      lastName: true,
      firstName: true,
      patronymic: true,
      department: { select: { name: true } },
    },
  });
  const byId = new Map(people.map((p) => [p.id, p]));

  const rows = standings
    .map((s) => ({ ...s, person: byId.get(s.staffId) }))
    .filter((r) => r.person)
    .sort(
      (a, b) =>
        b.missing.length - a.missing.length ||
        a.person!.lastName.localeCompare(b.person!.lastName, 'uk')
    );

  const incomplete = rows.filter((r) => r.missing.length > 0);
  const flagged = rows.filter((r) => r.notLecturer.length > 0);
  const shown = filter === 'missing' ? incomplete : filter === 'notLecturer' ? flagged : rows;

  const tab = (value: Filter, label: string, count: number) => (
    <Link
      key={value}
      href={value === 'all' ? '/moderation/disciplines' : `/moderation/disciplines?show=${value}`}
      aria-current={filter === value ? 'page' : undefined}
      className={`rounded-md border px-3 py-1.5 text-sm ${
        filter === value ? 'border-brand bg-brand/10 text-brand-strong' : 'hover:bg-muted'
      }`}
    >
      {label} · {count}
    </Link>
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Дисципліни пункту 5.1</h1>
        <p className="mt-0.5 max-w-3xl text-sm text-foreground-soft">
          Рейтинговий рік {template.year}. Кожен НПП із призначеними дисциплінами має подати запис
          за кожною. Хто не встиг до закриття року — отримає 0 балів. «Не лектор» на призначеній
          дисципліні варто перевірити вручну.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {tab('all', 'Усі з дисциплінами', rows.length)}
        {tab('missing', 'Не вистачає записів', incomplete.length)}
        {tab('notLecturer', 'Є «не лектор»', flagged.length)}
      </div>

      {shown.length === 0 ? (
        <EmptyState>
          {rows.length === 0
            ? 'Дисципліни ще не завантажено (pnpm db:import-disciplines).'
            : 'У цьому списку нікого немає.'}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr className="border-b">
                <th className="px-4 py-2 font-medium">НПП</th>
                <th className="px-4 py-2 font-medium">Кафедра</th>
                <th className="px-4 py-2 font-medium">Заповнено</th>
                <th className="px-4 py-2 font-medium">Немає запису</th>
                <th className="px-4 py-2 font-medium">Не лектор</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.staffId} className="border-b align-top last:border-0">
                  <td className="px-4 py-2">
                    <Link
                      href={`/staff/${r.staffId}/rating`}
                      className="text-brand hover:underline"
                    >
                      {r.person!.lastName} {r.person!.firstName} {r.person!.patronymic}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-foreground-soft">
                    {r.person!.department?.name.replace(/^Кафедра\s+/i, '') ?? '—'}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        r.missing.length > 0
                          ? 'bg-warning-surface text-warning'
                          : 'bg-success-surface text-success'
                      }`}
                    >
                      {progressText(r.done, r.assigned)}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <Names names={r.missing} person={fullName(r.person!)} title="Немає запису" />
                  </td>
                  <td className="px-4 py-2">
                    <Names
                      names={r.notLecturer}
                      person={fullName(r.person!)}
                      title="Відмічено «не лектор»"
                    />
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
