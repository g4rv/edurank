import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getActiveTemplate } from '@/lib/queries/get-active-template';
import { listMyDepartments } from '@/lib/queries/list-my-department';
import { getDepartmentsKnpp } from '@/lib/queries/get-department-knpp';
import { ACADEMIC_RANK_LABELS, SCIENTIFIC_DEGREE_LABELS } from '@/lib/labels';
import { AnimatedPage } from '@/components/ui/animated-page';
import { KnppSummary } from '@/components/kharakterystyka/knpp-summary';
import { cn } from '@/lib/utils';

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
export default async function MyDepartmentPage() {
  const session = await auth();
  if (!session) redirect('/login');

  const template = await getActiveTemplate();
  const departments = await listMyDepartments(session.user.staffId, template?.year ?? 0);

  // Not an error page: somebody who heads nothing simply has no business here,
  // and their own profile is where they were going.
  if (departments.length === 0) redirect('/profile');

  // Кнпп and «позицій із 20» per person, in three queries for every кафедра at
  // once rather than three per кафедра.
  const knppList = await getDepartmentsKnpp(
    departments.map((d) => d.id),
    template?.year ?? 0
  );
  const knppByDepartment = new Map(knppList.map((k) => [k.departmentId, k]));
  const positionsByStaff = new Map(knppList.flatMap((k) => k.staff.map((s) => [s.id, s] as const)));

  return (
    <AnimatedPage className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Моя кафедра</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {template ? `Рейтинг за ${template.year} рік` : 'Рейтинговий рік ще не налаштовано'}
        </p>
      </div>

      {departments.map((department) => (
        <section key={department.id} className="space-y-3">
          {departments.length > 1 && (
            <h2 className="text-lg font-medium">
              {department.name}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {department.faculty}
              </span>
            </h2>
          )}

          {template && knppByDepartment.has(department.id) && (
            <KnppSummary data={knppByDepartment.get(department.id)!} year={template.year} />
          )}

          {template && (
            <div className="flex flex-wrap gap-4">
              <Link
                href={`/stakes/${department.id}`}
                className="text-sm underline-offset-4 hover:underline"
              >
                Розподіл ставок на {template.year} рік →
              </Link>
              <Link
                href={`/my-department/students?department=${department.id}`}
                className="text-sm underline-offset-4 hover:underline"
              >
                Залучені здобувачі →
              </Link>
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-muted/60 text-left">
                  <th className="border border-border px-3 py-2 font-medium text-muted-foreground">
                    НПП
                  </th>
                  <th className="border border-border px-3 py-2 font-medium text-muted-foreground">
                    Звання / ступінь
                  </th>
                  <th className="w-28 border border-border px-3 py-2 text-right font-medium text-muted-foreground">
                    Бали
                  </th>
                  <th className="w-32 border border-border px-3 py-2 text-right font-medium text-muted-foreground">
                    Позицій із 20
                  </th>
                  <th className="w-44 border border-border px-3 py-2 font-medium text-muted-foreground">
                    Характеристика
                  </th>
                </tr>
              </thead>
              <tbody>
                {department.staff.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="border border-border px-3 py-6 text-center text-muted-foreground"
                    >
                      На кафедрі немає НПП
                    </td>
                  </tr>
                ) : (
                  department.staff.map((person) => (
                    <tr key={person.id} className="transition-colors hover:bg-muted/20">
                      <td className="border border-border px-3 py-2">
                        {person.name}
                        {/* Their кафедра is elsewhere and this one also pays
                            them a ставка (2026-08-24). */}
                        {person.isPartTime && (
                          <span
                            className="ml-2 inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                            title="Основна кафедра цієї людини — інша. Тут вона працює за сумісництвом."
                          >
                            Сумісник
                          </span>
                        )}
                      </td>
                      <td className="border border-border px-3 py-2 text-muted-foreground">
                        {[
                          person.academicRank && ACADEMIC_RANK_LABELS[person.academicRank],
                          person.scientificDegree &&
                            SCIENTIFIC_DEGREE_LABELS[person.scientificDegree],
                        ]
                          .filter(Boolean)
                          .join(', ') || '—'}
                      </td>
                      <td
                        className={cn(
                          'border border-border px-3 py-2 text-right font-medium tabular-nums'
                        )}
                      >
                        {person.total}
                      </td>
                      <td className="border border-border px-3 py-2 text-right tabular-nums">
                        <PositionCount entry={positionsByStaff.get(person.id)} />
                      </td>
                      <td className="border border-border px-3 py-2">
                        <div className="flex items-center gap-3 text-sm">
                          <Link
                            href={`/staff/${person.id}/kharakterystyka`}
                            className="underline-offset-4 hover:underline"
                          >
                            Переглянути
                          </Link>
                          {template && (
                            <a
                              href={`/api/export/kharakterystyka?year=${template.year}&staffId=${person.id}`}
                              download
                              className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                              title="Завантажити Характеристику (Excel)"
                            >
                              Excel
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </AnimatedPage>
  );
}

/**
 * «позицій із 20» for one person, marked when it clears the licence bar.
 *
 * Green means «counts towards Кнпп», red means it does not. Neither is about
 * pay: Кнпп is a divisor inside the ставка formula and nothing else, and
 * everybody on the кафедра receives a ставка either way.
 */
function PositionCount({ entry }: { entry?: { metCount: number; qualifies: boolean } }) {
  if (!entry) return <span className="text-muted-foreground">—</span>;

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        entry.qualifies
          ? 'bg-emerald-600/10 text-emerald-700 dark:text-emerald-400'
          : 'bg-destructive/10 text-destructive'
      )}
    >
      {entry.metCount}
    </span>
  );
}
