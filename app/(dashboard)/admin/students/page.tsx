export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { UK } from '@/lib/plural';
import { STUDENT_DEGREE_LABELS, STUDENT_FUNDING_LABELS, STUDY_FORM_LABELS } from '@/lib/labels';
import { SPECIALITY_CODES } from '@/lib/specialities/codes';
import {
  admittedYears,
  listAdmittedStudents,
  type AdmittedFilters,
} from '@/lib/queries/list-admitted-students';
import { AnimatedPage } from '@/components/ui/animated-page';
import { AnimatedRow } from '@/components/ui/animated-row';
import { AnimatedTableBody } from '@/components/ui/animated-table-body';
import { DataTable } from '@/components/ui/data-table';
import { Pagination } from '@/components/ui/pagination';
import { AdmittedStudentsFilters } from '@/components/admin/admitted-students-filters';

/** «A4.16 Середня освіта (захист України)», or the bare name where no code maps */
function specialityLabel(name: string): string {
  const code = SPECIALITY_CODES[name]?.code;
  return code ? `${code} ${name}` : name;
}

const DEGREES = new Set(Object.keys(STUDENT_DEGREE_LABELS));
const FORMS = new Set(Object.keys(STUDY_FORM_LABELS));
const FUNDINGS = new Set(Object.keys(STUDENT_FUNDING_LABELS));

/** A URL value is only a filter if it names something real */
function oneOf(value: string | string[] | undefined, allowed: Set<string>): string {
  return typeof value === 'string' && allowed.has(value) ? value : '';
}

const TH = 'px-4 py-3 text-left font-medium text-muted-foreground';

/**
 * Реєстр зарахованих — the admin's view of who an НПП may claim.
 *
 * ADMIN and nobody else: `DivisionEntityPermission` covers Staff, Department
 * and Faculty, and the register is deliberately not offered to divisions
 * (owner, 2026-09-03). If a приймальна комісія ever needs it, that is a
 * `STUDENT` entity permission and a decision of its own.
 */
export default async function AdmittedStudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await auth();
  if (!session) redirect('/login');
  if (session.user.role !== 'ADMIN') redirect('/');

  const params = await searchParams;
  const years = await admittedYears();

  // Nothing imported yet. Says who can fix it, rather than rendering an empty
  // table under five filters over nothing.
  if (years.length === 0) {
    return (
      <AnimatedPage className="space-y-6">
        <h1 className="text-2xl font-semibold">Здобувачі</h1>
        <div className="rounded-xl border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          Реєстр порожній. Зарахованих завантажують командою{' '}
          <code className="rounded bg-muted px-1.5 py-0.5">pnpm db:import-students --apply</code>.
        </div>
      </AnimatedPage>
    );
  }

  const asked = Number(typeof params.year === 'string' ? params.year : '');
  const year = years.includes(asked) ? asked : years[0]!;

  const degree = oneOf(params.degree, DEGREES);
  const form = oneOf(params.form, FORMS);
  const funding = oneOf(params.funding, FUNDINGS);
  const speciality = typeof params.speciality === 'string' ? params.speciality : '';
  const q = typeof params.q === 'string' ? params.q : '';
  const page = Math.max(1, Number(typeof params.page === 'string' ? params.page : '1') || 1);

  const [{ rows, total, totalPages }, specialities] = await Promise.all([
    listAdmittedStudents({
      year,
      degree: (degree || undefined) as AdmittedFilters['degree'],
      form: (form || undefined) as AdmittedFilters['form'],
      funding: (funding || undefined) as AdmittedFilters['funding'],
      specialityId: speciality || undefined,
      search: q,
      page,
    }),
    db.speciality.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ]);

  function hrefFor(next: number) {
    const sp = new URLSearchParams();
    sp.set('year', String(year));
    if (degree) sp.set('degree', degree);
    if (form) sp.set('form', form);
    if (funding) sp.set('funding', funding);
    if (speciality) sp.set('speciality', speciality);
    if (q.trim()) sp.set('q', q.trim());
    if (next > 1) sp.set('page', String(next));
    return `/admin/students?${sp.toString()}`;
  }

  return (
    <AnimatedPage className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Здобувачі</h1>
        <p className="mt-0.5 max-w-3xl text-sm text-muted-foreground">
          Реєстр зарахованих — з-поміж них НПП обирають залучених здобувачів. Один рядок — один
          вступ: людину, зараховану на дві спеціальності, тут видно двічі.
        </p>
      </div>

      <AdmittedStudentsFilters
        years={years}
        specialities={specialities.map((s) => ({ id: s.id, label: specialityLabel(s.name) }))}
        value={{ year, degree, form, funding, speciality, q }}
      />

      {rows.length === 0 ? (
        <div className="rounded-xl border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          Нічого не знайдено. Спробуйте змінити фільтри.
        </div>
      ) : (
        <DataTable>
          <thead>
            <tr className="border-b bg-muted/40">
              <th className={TH}>ПІБ</th>
              <th className={TH}>Фінансування</th>
              <th className={TH}>Форма</th>
              <th className={TH}>Ступінь</th>
              <th className={TH}>Спеціальність</th>
            </tr>
          </thead>
          <AnimatedTableBody>
            {rows.map((row) => (
              <AnimatedRow key={row.id} className="transition-colors">
                <td className="px-4 py-3 font-medium">{row.name}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {STUDENT_FUNDING_LABELS[row.funding]}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">{STUDY_FORM_LABELS[row.form]}</td>
                <td className="px-4 py-3 whitespace-nowrap">{STUDENT_DEGREE_LABELS[row.degree]}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {specialityLabel(row.speciality)}
                </td>
              </AnimatedRow>
            ))}
          </AnimatedTableBody>
        </DataTable>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        hrefFor={hrefFor}
        summary={UK.student(total)}
      />
    </AnimatedPage>
  );
}
