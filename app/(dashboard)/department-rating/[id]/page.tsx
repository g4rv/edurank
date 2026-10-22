import { notFound, redirect } from 'next/navigation';
import { ListHeader } from '@/components/aurora/ui/list-header';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { DownloadButton } from '@/components/ui/download-button';
import { DepartmentReportForm } from '@/components/department-rating/report-form';
import { auth } from '@/lib/auth';
import { reportAccessFor, visibleDepartmentIds } from '@/lib/department-rating/access';
import { db } from '@/lib/db';
import { KYIV } from '@/lib/kyiv-time';
import { getDepartmentReport } from '@/lib/queries/get-department-report';
import { EMPTY_NARRATIVE } from '@/validations/department-report';

/**
 * One кафедра's Рейтинг кафедри — the template on screen.
 *
 * The завідувач of this кафедра fills it, ADMIN may too; a декан of its
 * факультет reads it. Read-only for everybody once the rating year is CLOSED,
 * as the personal rating is. Anybody else gets a 404, not a refusal — the
 * кафедра's existence is not theirs to learn from the URL.
 */
export default async function DepartmentReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: departmentId } = await params;

  const session = await auth();
  if (!session) redirect('/login');

  const access = await reportAccessFor(session.user, departmentId);
  if (!access.canView) notFound();

  const template = await db.ratingTemplate.findFirst({
    where: { isActive: true },
    select: { year: true, status: true },
  });
  if (!template) notFound();
  const { year } = template;

  const view = await getDepartmentReport(departmentId, year);
  if (!view) notFound();

  const closed = template.status === 'CLOSED';
  const editable = access.canEdit && !closed;

  // A list to go back to only for somebody who has one — a завідувач of a
  // single кафедра is redirected from it straight back here.
  const ids = await visibleDepartmentIds(session.user);
  const hasList = ids === 'all' || ids.length > 1;

  const updated = view.report
    ? `Оновлено ${view.report.updatedAt.toLocaleDateString('uk-UA', KYIV)}${
        view.report.updatedByName ? ` · ${view.report.updatedByName}` : ''
      }`
    : 'Ще не заповнено';

  return (
    <div className="space-y-4">
      {hasList && (
        <Breadcrumbs
          items={[
            { label: 'Рейтинг кафедри', href: '/department-rating' },
            { label: view.department.name },
          ]}
        />
      )}

      <ListHeader
        title={view.department.name}
        subtitle={`Звіт за ${year} календарний рік${view.department.faculty ? ` · ${view.department.faculty}` : ''} · ${updated}`}
        actions={
          <DownloadButton
            href={`/api/export/department-report?department=${departmentId}`}
            label="Вивантажити Excel"
            title="Звіт кафедри у форматі шаблону"
          />
        }
      />

      <p className="text-sm text-foreground-soft">
        У показники кафедри вносяться дані <strong>лише по штатних працівниках</strong>.
        {closed && ' Рейтинговий рік закрито — звіт не редагується.'}
        {!closed &&
          !access.canEdit &&
          ' Звіт заповнює завідувач кафедри або заступник з наукової роботи.'}
      </p>

      <DepartmentReportForm
        departmentId={departmentId}
        year={year}
        indicators={view.indicators}
        values={view.report?.values ?? {}}
        narrative={view.report?.narrative ?? EMPTY_NARRATIVE}
        editable={editable}
      />
    </div>
  );
}
