import { auth } from '@/lib/auth';
import { attachmentHeader } from '@/lib/export/file-names';
import { logError } from '@/lib/log';
import { buildProfileChecksWorkbook } from '@/lib/profile-check/export-workbook';
import { listProfileChecks } from '@/lib/queries/list-profile-checks';

export const runtime = 'nodejs';

/**
 * The «Перевірка профілів» list as Excel — ADMIN only, the page's own filters
 * (`?department=`, `?only=problems`). NOT covered by `proxy.ts`: every `/api`
 * route authenticates itself.
 *
 * A sheet per platform (`lib/profile-check/export-workbook.ts`): a row per
 * person, a column per requirement, red / green cells. With no filter the rows
 * are grouped by факультет and кафедра.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    return new Response('Forbidden', { status: 403 });
  }

  const url = new URL(request.url);
  const departmentId = url.searchParams.get('department') || undefined;
  const onlyProblems = url.searchParams.get('only') === 'problems';
  const q = url.searchParams.get('q')?.trim() || undefined;

  try {
    const all = await listProfileChecks({ departmentId, q });
    // No filter at all: faculties with their кафедри and people. A filter: a flat list.
    const wb = buildProfileChecksWorkbook(all, {
      grouped: !departmentId && !q && !onlyProblems,
      onlyProblems,
    });

    const buffer = await wb.xlsx.writeBuffer();
    return new Response(buffer as BodyInit, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': attachmentHeader('Перевірка профілів.xlsx'),
      },
    });
  } catch (e) {
    logError('export.profileChecks', e, { userId: session.user.id });
    return new Response('Internal Server Error', { status: 500 });
  }
}
