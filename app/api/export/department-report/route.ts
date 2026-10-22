import { auth } from '@/lib/auth';
import { reportAccessFor } from '@/lib/department-rating/access';
import { buildDepartmentReportWorkbook } from '@/lib/department-rating/export-workbook';
import { attachmentHeader } from '@/lib/export/file-names';
import { activeYear } from '@/lib/queries/get-active-template';
import { getDepartmentReport } from '@/lib/queries/get-department-report';
import { logError } from '@/lib/log';
import { EMPTY_NARRATIVE } from '@/validations/department-report';

/**
 * One кафедра's Рейтинг кафедри as Excel, in the template's layout.
 *
 * `?department=<id>`. Whoever may open the report page may download it —
 * `reportAccessFor`, the same door the page and the save use.
 *
 * NOT covered by `proxy.ts` — every `/api` route authenticates itself.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });

  const departmentId = new URL(request.url).searchParams.get('department');
  if (!departmentId) return new Response('Bad Request', { status: 400 });

  try {
    const access = await reportAccessFor(session.user, departmentId);
    if (!access.canView) return new Response('Forbidden', { status: 403 });

    const year = await activeYear();
    if (year === null) return new Response('Not Found', { status: 404 });

    const view = await getDepartmentReport(departmentId, year);
    if (!view) return new Response('Not Found', { status: 404 });

    const wb = buildDepartmentReportWorkbook({
      departmentName: view.department.name,
      year,
      indicators: view.indicators,
      values: view.report?.values ?? {},
      narrative: view.report?.narrative ?? EMPTY_NARRATIVE,
      total: view.report?.totalScore ?? 0,
    });
    const buffer = await wb.xlsx.writeBuffer();
    return new Response(buffer as BodyInit, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': attachmentHeader(
          `Рейтинг кафедри ${year} — ${view.department.name}.xlsx`
        ),
      },
    });
  } catch (e) {
    logError('export.departmentReport', e, { userId: session.user.id });
    return new Response('Internal Server Error', { status: 500 });
  }
}
