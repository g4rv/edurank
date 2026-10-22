import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { attachmentHeader } from '@/lib/export/file-names';
import { logError } from '@/lib/log';
import {
  departmentsWorkbook,
  reportsWorkbook,
  staffWorkbook,
  topStaffWorkbook,
} from '@/lib/dashboard/ranking-workbook';
import { isMetricKey, METRIC_LABELS } from '@/lib/dashboard/top-staff';
import { getReportData } from '@/lib/queries/get-rating-chart';
import { getTopStaff } from '@/lib/queries/get-top-staff';
import { listDepartmentReports } from '@/lib/queries/list-department-reports';

export const runtime = 'nodejs';

/**
 * The dashboard's «Рейтинг кафедр» as Excel, the rows the card shows.
 *
 * `?view=staff` (default) — every кафедра's average НПП score; add
 * `&department=<id>` for one кафедра's НПП. `?view=report` — the кафедри ranked
 * by their own report; ADMIN only, as the tab is. `?year=` is a rating year.
 *
 * NOT covered by `proxy.ts` — every `/api` route authenticates itself. Same
 * door as the page: ADMIN and EDITOR, never a USER.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session || session.user.role === 'USER') {
    return new Response('Forbidden', { status: 403 });
  }

  const url = new URL(request.url);
  const view = url.searchParams.get('view') ?? 'staff';
  if (view !== 'staff' && view !== 'report' && view !== 'top') {
    return new Response('Bad Request', { status: 400 });
  }
  const metric = url.searchParams.get('metric') ?? 'total';
  if (view === 'top' && !isMetricKey(metric)) return new Response('Bad Request', { status: 400 });
  if (view === 'report' && session.user.role !== 'ADMIN') {
    return new Response('Forbidden', { status: 403 });
  }

  // Read the raw param before converting: Number(null) is 0, and 0 is an integer
  const rawYear = url.searchParams.get('year');
  const yearParam = rawYear === null ? NaN : Number(rawYear);
  const template = Number.isInteger(yearParam)
    ? await db.ratingTemplate.findUnique({ where: { year: yearParam } })
    : await db.ratingTemplate.findFirst({ where: { isActive: true } });
  if (!template) return new Response('Not Found', { status: 404 });
  const year = template.year;

  try {
    let wb;
    let name: string;
    if (view === 'report') {
      wb = reportsWorkbook(year, await listDepartmentReports(year, 'all'));
      name = `Рейтинг кафедр ${year} — за звітом.xlsx`;
    } else if (view === 'top' && isMetricKey(metric)) {
      const top = (await getTopStaff(year))[metric];
      wb = topStaffWorkbook(year, METRIC_LABELS[metric], top, metric !== 'total');
      name = `Топ-20 НПП ${year} — ${METRIC_LABELS[metric].split(' — ')[0]}.xlsx`;
    } else {
      const departments = await getReportData(year);
      const departmentId = url.searchParams.get('department');
      if (departmentId) {
        const department = departments.find((d) => d.id === departmentId);
        if (!department) return new Response('Not Found', { status: 404 });
        wb = staffWorkbook(year, department);
        name = `Рейтинг НПП ${year} — ${department.name}.xlsx`;
      } else {
        wb = departmentsWorkbook(year, departments);
        name = `Рейтинг кафедр ${year} — середній бал НПП.xlsx`;
      }
    }

    const buffer = await wb.xlsx.writeBuffer();
    return new Response(buffer as BodyInit, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': attachmentHeader(name),
      },
    });
  } catch (e) {
    logError('export.departmentRanking', e, { userId: session.user.id });
    return new Response('Internal Server Error', { status: 500 });
  }
}
