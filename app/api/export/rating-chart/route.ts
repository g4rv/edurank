import { renderToBuffer } from '@react-pdf/renderer';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  getDepartmentChart,
  getDepartmentStaffChart,
  METRIC_LEGEND,
  METRIC_TITLES,
  type RatingMetric,
} from '@/lib/queries/get-rating-chart';
import { TOP_STAFF_COUNT, type MetricKey } from '@/lib/dashboard/top-staff';
import { getTopStaff } from '@/lib/queries/get-top-staff';
import { listDepartmentReports } from '@/lib/queries/list-department-reports';
import {
  DepartmentChartDocument,
  DepartmentReportsDocument,
  DepartmentStaffDocument,
} from '@/lib/rating/pdf-chart';

// GET /api/export/rating-chart?kind=departments|staff&metric=total|1..5
//     &departmentId=<id>&year=2026
//
// A ranked bar chart as a PDF, in the shape the university already circulates.
// The proxy does not cover /api, so this route authenticates itself.

export const runtime = 'nodejs';

function parseMetric(raw: string | null): RatingMetric | null {
  if (raw === 'total') return 'total';
  const n = Number(raw);
  return n >= 1 && n <= 5 && Number.isInteger(n) ? (n as RatingMetric) : null;
}

/**
 * `inline` is what makes the preview possible: an `attachment` header tells the
 * browser to download, so an <iframe> pointed at it renders nothing at all.
 * The body is identical either way — only the header differs, so what the
 * preview shows is exactly what the download saves.
 *
 * Both filename forms are sent: a Cyrillic name alone breaks older clients.
 */
function contentDisposition(name: string, inline: boolean): string {
  const ascii = name.replace(/[^\x20-\x7E]/g, '_');
  const kind = inline ? 'inline' : 'attachment';
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session || session.user.role === 'USER') {
    return new Response('Forbidden', { status: 403 });
  }

  const url = new URL(request.url);
  const kind = url.searchParams.get('kind') ?? 'departments';
  const inline = url.searchParams.get('inline') === '1';
  const metric = parseMetric(url.searchParams.get('metric') ?? 'total');
  if (!metric) return new Response('Bad metric', { status: 400 });

  // Read the raw param before converting: Number(null) is 0, and 0 is an
  // integer, so a missing year would look up the template for year zero.
  const rawYear = url.searchParams.get('year');
  const yearParam = rawYear === null ? NaN : Number(rawYear);
  const template = Number.isInteger(yearParam)
    ? await db.ratingTemplate.findUnique({ where: { year: yearParam } })
    : await db.ratingTemplate.findFirst({ where: { isActive: true } });
  if (!template) return new Response('Not found', { status: 404 });

  const metricKey = String(metric);

  // «Топ-20 НПП»: the best people by the total or by one розділ, university-wide —
  // the same bars as one кафедра's НПП, headed with the list's name
  if (kind === 'top') {
    const top = (await getTopStaff(template.year))[metricKey as MetricKey];
    if (top.length === 0) return new Response('Empty', { status: 409 });

    const buffer = await renderToBuffer(
      DepartmentStaffDocument({
        departmentName: `Топ-${TOP_STAFF_COUNT} НПП`,
        rows: top.map((p) => ({ name: p.name, total: p.total, value: p.value })),
        year: template.year,
        metricLegend: METRIC_LEGEND[metricKey],
        showMetricSeries: metric !== 'total',
      })
    );
    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': contentDisposition(
          `Топ-${TOP_STAFF_COUNT} НПП ${template.year} — ${metric === 'total' ? 'загальний бал' : `розділ ${metric}`}.pdf`,
          inline
        ),
      },
    });
  }

  // The кафедри ranked by their own report. The reports are the head's work and
  // the dashboard shows this ranking to ADMIN alone, so the PDF does the same.
  if (kind === 'reports') {
    if (session.user.role !== 'ADMIN') return new Response('Forbidden', { status: 403 });
    const reports = await listDepartmentReports(template.year, 'all');
    const filled = reports.filter((r) => r.totalScore !== null);
    if (filled.length === 0) return new Response('Empty', { status: 409 });

    const buffer = await renderToBuffer(
      DepartmentReportsDocument({
        rows: filled.map((r) => ({ name: r.name, value: r.totalScore ?? 0 })),
        year: template.year,
        unfilled: reports.length - filled.length,
      })
    );
    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': contentDisposition(
          `Рейтинг кафедр ${template.year} — за звітом.pdf`,
          inline
        ),
      },
    });
  }

  if (kind === 'staff') {
    const departmentId = url.searchParams.get('departmentId');
    if (!departmentId) return new Response('Bad request', { status: 400 });

    const data = await getDepartmentStaffChart(departmentId, template.year, metric);
    if (!data) return new Response('Not found', { status: 404 });
    if (data.staff.length === 0) return new Response('Empty', { status: 409 });

    const buffer = await renderToBuffer(
      DepartmentStaffDocument({
        departmentName: data.departmentName,
        rows: data.staff,
        year: template.year,
        metricLegend: METRIC_LEGEND[metricKey],
        showMetricSeries: metric !== 'total',
      })
    );

    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': contentDisposition(
          `${data.departmentName} — рейтинг ${template.year}.pdf`,
          inline
        ),
      },
    });
  }

  const rows = await getDepartmentChart(template.year, metric);
  if (rows.length === 0) return new Response('Empty', { status: 409 });

  const buffer = await renderToBuffer(
    DepartmentChartDocument({
      rows,
      year: template.year,
      metricTitle: METRIC_TITLES[metricKey],
    })
  );

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': contentDisposition(`Рейтинг кафедр ${template.year}.pdf`, inline),
    },
  });
}
