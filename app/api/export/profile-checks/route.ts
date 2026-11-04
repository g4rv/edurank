import ExcelJS from 'exceljs';
import { auth } from '@/lib/auth';
import { attachmentHeader } from '@/lib/export/file-names';
import { logError } from '@/lib/log';
import {
  CHECK_FIELD_LABELS,
  PLATFORM_LABELS,
  PLATFORM_STATUS_LABELS,
} from '@/lib/profile-check/labels';
import { PLATFORMS } from '@/lib/profile-check/types';
import { listProfileChecks } from '@/lib/queries/list-profile-checks';

export const runtime = 'nodejs';

/**
 * The «Перевірка профілів» list as Excel — ADMIN only, the page's own filters
 * (`?department=`, `?only=problems`). NOT covered by `proxy.ts`: every `/api`
 * route authenticates itself.
 *
 * One row per person; a column per platform with its status; and a last column
 * that says what to fix, so a кафедра can be sent its own rows as they are.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    return new Response('Forbidden', { status: 403 });
  }

  const url = new URL(request.url);
  const departmentId = url.searchParams.get('department') || undefined;
  const onlyProblems = url.searchParams.get('only') === 'problems';

  try {
    const all = await listProfileChecks({ departmentId });
    const rows = onlyProblems ? all.filter((r) => r.problem) : all;

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Перевірка профілів');
    ws.columns = [
      { header: 'НПП', width: 38 },
      { header: 'Факультет', width: 40 },
      { header: 'Кафедра', width: 46 },
      ...PLATFORMS.map((p) => ({ header: PLATFORM_LABELS[p], width: 20 })),
      { header: 'Що виправити', width: 90 },
    ];
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];

    for (const r of rows) {
      const fixes: string[] = [];
      for (const p of PLATFORMS) {
        const cell = r.cells[p];
        if (!cell) continue;
        if (cell.error) fixes.push(`${PLATFORM_LABELS[p]}: ${cell.error}`);
        for (const c of cell.checks) {
          if (c.status === 'error' || c.status === 'warning') {
            fixes.push(
              `${PLATFORM_LABELS[p]} — ${CHECK_FIELD_LABELS[c.field] ?? c.field}: ${c.message ?? ''}`
            );
          }
        }
      }
      ws.addRow([
        r.name,
        r.faculty ?? '',
        r.department ?? '',
        ...PLATFORMS.map((p) => (r.cells[p] ? PLATFORM_STATUS_LABELS[r.cells[p]!.status] : '')),
        fixes.join('\n'),
      ]);
    }
    ws.getColumn(PLATFORMS.length + 4).alignment = { wrapText: true, vertical: 'top' };

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
