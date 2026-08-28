import { auth } from '@/lib/auth';
import { listStaff } from '@/lib/queries/list-staff';
import { attachmentHeader } from '@/lib/export/file-names';
import { fullStaffName } from '@/lib/staff-name';
import { parseStaffListParams, toStaffFilters } from '@/lib/staff/list-params';
import { buildStaffListWorkbook } from '@/lib/staff/export-workbook';
import { logError } from '@/lib/log';

// GET /api/export/staff?<the same query string /staff is showing>
//
// The list on screen, as one .xlsx: ПІБ and how many. The query string is the
// contract — the button on /staff simply hands over the URL it is already on,
// and `parseStaffListParams` is the same reader the page uses, so «that is what
// I was looking at» holds by construction rather than by two people keeping two
// parsers in step.
//
// ADMIN only. Not because a name is a secret — an EDITOR reads the same list on
// screen — but because a file leaves the building, and who may take the roster
// out of it is a decision the university makes about people, not a side effect
// of who can open a page. The proxy does not cover /api, so auth lives here.
export async function GET(request: Request) {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });
  if (session.user.role !== 'ADMIN') return new Response('Forbidden', { status: 403 });

  try {
    const params = parseStaffListParams(new URL(request.url).searchParams, { isAdmin: true });
    const staff = await listStaff(toStaffFilters(params, { isAdmin: true }));

    // `department ?? division` is the same fallback the table's «Кафедра /
    // Відділ» cell uses: a non-НПП is placed on a відділ and has no кафедра, so
    // one column answers «where do they work» for both kinds of person.
    const wb = buildStaffListWorkbook(
      staff.map((person) => ({
        fullName: fullStaffName(person),
        email: person.email,
        isActivated: person.isActivated,
        department: person.department?.name ?? person.division?.name ?? null,
        partTimeDepartments: person.partTimeDepartments.map((p) => p.department.name),
      }))
    );
    const buffer = await wb.xlsx.writeBuffer();

    return new Response(buffer as BodyInit, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': attachmentHeader(fileNameFor(params.archivedView)),
      },
    });
  } catch (e) {
    // A download that fails silently looks like a browser problem and gets
    // reported as one, so the stack has to land somewhere.
    logError('export.staffList', e, { userId: session.user.id });
    return new Response('Internal Server Error', { status: 500 });
  }
}

function fileNameFor(archivedView: boolean): string {
  const today = new Date().toISOString().slice(0, 10);
  return archivedView ? `Архів персоналу ${today}.xlsx` : `Список персоналу ${today}.xlsx`;
}
