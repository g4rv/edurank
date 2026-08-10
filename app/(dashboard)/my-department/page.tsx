import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getActiveTemplate } from '@/lib/queries/get-active-template';
import { listMyDepartments } from '@/lib/queries/list-my-department';
import { ACADEMIC_RANK_LABELS, SCIENTIFIC_DEGREE_LABELS } from '@/lib/labels';
import { AnimatedPage } from '@/components/ui/animated-page';
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
                  <th className="w-44 border border-border px-3 py-2 font-medium text-muted-foreground">
                    Характеристика
                  </th>
                </tr>
              </thead>
              <tbody>
                {department.staff.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="border border-border px-3 py-6 text-center text-muted-foreground"
                    >
                      На кафедрі немає НПП
                    </td>
                  </tr>
                ) : (
                  department.staff.map((person) => (
                    <tr key={person.id} className="transition-colors hover:bg-muted/20">
                      <td className="border border-border px-3 py-2">{person.name}</td>
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
