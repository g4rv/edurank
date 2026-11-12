import JSZip from 'jszip';
import { auth } from '@/lib/auth';
import { attachmentHeader, safeName } from '@/lib/export/file-names';
import { logError } from '@/lib/log';
import { buildProfileChecksWorkbook } from '@/lib/profile-check/export-workbook';
import { listProfileChecks, type ProfileCheckRow } from '@/lib/queries/list-profile-checks';

export const runtime = 'nodejs';

/**
 * The «Перевірка профілів» list as a zip (owner, 2026-11-09): a folder per
 * факультет, in it ONE file per кафедра, named after it, with that кафедра's
 * people — the same sheets per platform as the single export. ADMIN only, the
 * page's own filters (`?department=`, `?only=problems`, `?q=`). NOT covered by
 * `proxy.ts`: every `/api` route authenticates itself.
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
    const rows = onlyProblems ? all.filter((r) => r.problem) : all;

    // факультет → кафедра → people
    const tree = new Map<string, Map<string, ProfileCheckRow[]>>();
    for (const r of rows) {
      const faculty = safeName(r.faculty, 'Без факультету');
      const department = safeName(r.department, 'Без кафедри');
      const departments = tree.get(faculty) ?? new Map<string, ProfileCheckRow[]>();
      departments.set(department, [...(departments.get(department) ?? []), r]);
      tree.set(faculty, departments);
    }

    const zip = new JSZip();
    for (const [faculty, departments] of tree) {
      for (const [department, people] of departments) {
        const wb = buildProfileChecksWorkbook(people, {
          grouped: false,
          bare: true,
          onlyProblems: false, // `rows` is already narrowed
        });
        const buffer = await wb.xlsx.writeBuffer();
        zip.file(`${faculty}/${department}.xlsx`, buffer as ArrayBuffer);
      }
    }

    const body = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
    return new Response(body as BodyInit, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': attachmentHeader('Перевірка профілів.zip'),
      },
    });
  } catch (e) {
    logError('export.profileChecksZip', e, { userId: session.user.id });
    return new Response('Internal Server Error', { status: 500 });
  }
}
