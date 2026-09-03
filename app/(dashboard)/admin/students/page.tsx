export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { UK } from '@/lib/plural';
import { STUDENT_DEGREE_LABELS, STUDENT_FUNDING_LABELS, STUDY_FORM_LABELS } from '@/lib/labels';
import { SPECIALITY_CODES } from '@/lib/specialities/codes';
import {
  ADMITTED_SORTS,
  admittedYears,
  listAdmittedStudents,
  type AdmittedFilters,
  type AdmittedSort,
} from '@/lib/queries/list-admitted-students';
import { AnimatedPage } from '@/components/ui/animated-page';
import { AnimatedRow } from '@/components/ui/animated-row';
import { AnimatedTableBody } from '@/components/ui/animated-table-body';
import { DataTable } from '@/components/ui/data-table';
import { Pagination } from '@/components/ui/pagination';
import { SortTh } from '@/components/ui/sort-th';
import { AdmittedStudentsFilters } from '@/components/admin/admitted-students-filters';
import { AddAdmittedStudent } from '@/components/admin/add-admitted-student';
import { DeleteAdmittedStudent } from '@/components/admin/delete-admitted-student';
import { ImportAdmittedStudents } from '@/components/admin/import-admitted-students';

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

/**
 * The columns, and the width each one holds.
 *
 * The widths are why the table is `table-fixed`. Left to itself a browser sizes
 * a column to the widest cell PRESENT, so every change of sort or page reflowed
 * the whole table — «Євдокимчик Дмитро Володимирович» is wider than the longest
 * бакалавр name, and the ПІБ column grew by twenty pixels and shoved everything
 * right of it sideways. A list somebody scans down should not move under them.
 *
 * Percentages rather than pixels, so the table still uses whatever width the
 * screen gives it. ПІБ gets the largest share because a wrapped name is the
 * one thing here that reads badly — the longest in the 2026 register needs
 * ~300px. Спеціальність takes the remainder and is the column allowed to wrap
 * on a narrow screen: «B13 Інформаційна, бібліотечна та архівна справа» over
 * two lines is still legible, a person's name split across two is not.
 */
const COLUMNS: { key: AdmittedSort; label: string; title?: string; width: string }[] = [
  { key: 'name', label: 'ПІБ', width: 'w-[32%]' },
  { key: 'funding', label: 'Фінансування', width: 'w-[13%]' },
  { key: 'form', label: 'Форма', width: 'w-[9%]' },
  { key: 'degree', label: 'Ступінь', width: 'w-[10%]' },
  {
    key: 'speciality',
    label: 'Спеціальність',
    // Said out loud, because the cell shows the code first and an alphabetical
    // list therefore looks unsorted.
    title: 'Сортування за назвою спеціальності, не за кодом',
    width: '',
  },
];

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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold">Здобувачі</h1>
          <ImportAdmittedStudents defaultYear={new Date().getFullYear()} />
        </div>
        <div className="rounded-xl border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          Реєстр порожній. Імпортуйте наказ, щоб НПП могли заявляти залучених здобувачів.
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
  const sort: AdmittedSort =
    typeof params.sort === 'string' && (ADMITTED_SORTS as readonly string[]).includes(params.sort)
      ? (params.sort as AdmittedSort)
      : 'name';
  const dir: 'asc' | 'desc' = params.dir === 'desc' ? 'desc' : 'asc';

  const [{ rows, total, totalPages }, specialities] = await Promise.all([
    listAdmittedStudents({
      year,
      degree: (degree || undefined) as AdmittedFilters['degree'],
      form: (form || undefined) as AdmittedFilters['form'],
      funding: (funding || undefined) as AdmittedFilters['funding'],
      specialityId: speciality || undefined,
      search: q,
      page,
      sort,
      dir,
    }),
    db.speciality.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ]);

  /**
   * The page's own URL with some parts replaced.
   *
   * A sort change drops `page`: row 200 under one ordering is a different
   * person under another, so keeping the number lands somebody on a page that
   * has nothing to do with what they clicked.
   */
  function buildHref(over: { page?: number; sort?: AdmittedSort; dir?: 'asc' | 'desc' }) {
    const sp = new URLSearchParams();
    sp.set('year', String(year));
    if (degree) sp.set('degree', degree);
    if (form) sp.set('form', form);
    if (funding) sp.set('funding', funding);
    if (speciality) sp.set('speciality', speciality);
    if (q.trim()) sp.set('q', q.trim());

    const nextSort = over.sort ?? sort;
    const nextDir = over.dir ?? dir;
    if (nextSort !== 'name') sp.set('sort', nextSort);
    if (nextDir !== 'asc') sp.set('dir', nextDir);

    const nextPage = over.sort ? 1 : (over.page ?? page);
    if (nextPage > 1) sp.set('page', String(nextPage));

    return `/admin/students?${sp.toString()}`;
  }

  /** Clicking the active column flips it; clicking another starts it ascending */
  function sortHref(column: AdmittedSort) {
    return buildHref({
      sort: column,
      dir: sort === column && dir === 'asc' ? 'desc' : 'asc',
    });
  }

  return (
    // The table takes whatever is left after the header, filters and pager,
    // and scrolls its rows inside the card — so the pager stays on screen
    // instead of sitting thirty rows below the fold. Same shell as /staff.
    <AnimatedPage className="flex h-full min-h-0 flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Здобувачі</h1>
          <p className="mt-0.5 max-w-3xl text-sm text-muted-foreground">
            Реєстр зарахованих — з-поміж них НПП обирають залучених здобувачів. Один рядок — один
            вступ: людину, зараховану на дві спеціальності, тут видно двічі.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ImportAdmittedStudents defaultYear={year} />
          <AddAdmittedStudent
            year={year}
            specialities={specialities.map((s) => ({ id: s.id, label: specialityLabel(s.name) }))}
          />
        </div>
      </div>

      <AdmittedStudentsFilters
        years={years}
        specialities={specialities.map((s) => ({ id: s.id, label: specialityLabel(s.name) }))}
        value={{ year, degree, form, funding, speciality, q, sort, dir }}
      />

      {rows.length === 0 ? (
        <div className="rounded-xl border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          Нічого не знайдено. Спробуйте змінити фільтри.
        </div>
      ) : (
        <DataTable fill className="table-fixed">
          <thead>
            <tr className="border-b bg-muted/40">
              {COLUMNS.map((column) => (
                <SortTh
                  key={column.key}
                  label={column.label}
                  title={column.title}
                  className={column.width}
                  href={sortHref(column.key)}
                  active={sort === column.key}
                  dir={sort === column.key ? dir : 'asc'}
                />
              ))}
              <th className="w-12" />
            </tr>
          </thead>
          <AnimatedTableBody>
            {rows.map((row) => (
              <AnimatedRow key={row.id} className="transition-colors">
                <td className="px-4 py-3 font-medium break-words">{row.name}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {STUDENT_FUNDING_LABELS[row.funding]}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">{STUDY_FORM_LABELS[row.form]}</td>
                <td className="px-4 py-3 whitespace-nowrap">{STUDENT_DEGREE_LABELS[row.degree]}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {specialityLabel(row.speciality)}
                </td>
                <td className="px-4 py-1 text-right">
                  <DeleteAdmittedStudent student={row} />
                </td>
              </AnimatedRow>
            ))}
          </AnimatedTableBody>
        </DataTable>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        hrefFor={(p) => buildHref({ page: p })}
        summary={UK.student(total)}
      />
    </AnimatedPage>
  );
}
