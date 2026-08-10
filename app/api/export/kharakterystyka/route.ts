import JSZip from 'jszip';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { ON_ROSTER } from '@/lib/queries/roster';
import { canViewAcademicRecord } from '@/lib/queries/scope';
import { getKharakterystyka, getKharakterystykaMany } from '@/lib/queries/get-kharakterystyka';
import { buildKharakterystykaWorkbook } from '@/lib/kharakterystyka/export-workbook';
import { attachmentHeader, personFileNames } from '@/lib/export/file-names';
import { ACADEMIC_RANK_LABELS, SCIENTIFIC_DEGREE_LABELS } from '@/lib/labels';
import { logError } from '@/lib/log';

// GET /api/export/kharakterystyka?year=2026[&staffId=…]
//
//   with staffId — one .xlsx, for anybody entitled to read that person's record
//   without      — a zip of every НПП, ADMIN/EDITOR only
//
// The proxy matcher excludes /api entirely, so this route authenticates itself.

/** The university's own name for the document, kept for the file name */
const DOC_SUFFIX = 'Характеристика_РНПАВ';

function fullNameOf(s: { lastName: string; firstName: string; patronymic: string }): string {
  return `${s.lastName} ${s.firstName} ${s.patronymic}`;
}

const STAFF_SELECT = {
  id: true,
  lastName: true,
  firstName: true,
  patronymic: true,
  academicRank: true,
  scientificDegree: true,
  department: { select: { name: true } },
} as const;

type ExportStaffRow = {
  id: string;
  lastName: string;
  firstName: string;
  patronymic: string;
  academicRank: keyof typeof ACADEMIC_RANK_LABELS | null;
  scientificDegree: keyof typeof SCIENTIFIC_DEGREE_LABELS | null;
  department: { name: string } | null;
};

function titleOf(staff: ExportStaffRow): string {
  return [
    staff.academicRank ? ACADEMIC_RANK_LABELS[staff.academicRank].toLowerCase() : null,
    staff.scientificDegree ? SCIENTIFIC_DEGREE_LABELS[staff.scientificDegree].toLowerCase() : null,
  ]
    .filter(Boolean)
    .join(', ');
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });

  const url = new URL(request.url);
  // Read the raw param before converting: Number(null) is 0 and 0 is an
  // integer, so a missing year would look up the template for year zero and
  // 404 instead of falling back to the active one.
  const rawYear = url.searchParams.get('year');
  const yearParam = rawYear === null ? NaN : Number(rawYear);
  const staffId = url.searchParams.get('staffId');

  const template = Number.isInteger(yearParam)
    ? await db.ratingTemplate.findUnique({ where: { year: yearParam } })
    : await db.ratingTemplate.findFirst({ where: { isActive: true } });
  if (!template) return new Response('Not found', { status: 404 });

  try {
    if (staffId) return await singleDocument(session.user, staffId, template.year);
    return await archive(session.user, template.year);
  } catch (e) {
    // An export that dies silently looks to the user like a browser problem,
    // and nothing anywhere would say otherwise.
    logError('export.kharakterystyka', e, { userId: session.user.id, entityId: staffId ?? '' });
    return new Response('Internal Server Error', { status: 500 });
  }
}

/**
 * One person's document.
 *
 * Access is `canViewAcademicRecord`, the same rule the page uses — ADMIN and
 * EDITOR, the завідувач of that person's кафедра, the декан of its факультет,
 * and the person themselves. Checked here rather than inherited from the page:
 * /api is outside the proxy, and a route that trusted a referrer would hand any
 * signed-in НПП every colleague's document.
 */
async function singleDocument(
  user: { role: string; id?: string; staffId?: string | null },
  staffId: string,
  year: number
): Promise<Response> {
  if (!(await canViewAcademicRecord(user, staffId))) {
    return new Response('Forbidden', { status: 403 });
  }

  const staff = (await db.staff.findUnique({
    where: { id: staffId },
    select: STAFF_SELECT,
  })) as ExportStaffRow | null;
  if (!staff) return new Response('Not found', { status: 404 });

  const data = await getKharakterystyka(staffId, year);
  // Null means non-НПП: the document is about academic activity, and an empty
  // one for an accountant asserts something false rather than nothing.
  if (!data) return new Response('Not found', { status: 404 });

  const fullName = fullNameOf(staff);
  const wb = buildKharakterystykaWorkbook(
    { fullName, department: staff.department?.name ?? '', academicTitle: titleOf(staff) },
    data
  );

  const [fileName] = personFileNames([fullName], DOC_SUFFIX);
  const buffer = await wb.xlsx.writeBuffer();

  return new Response(buffer as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': attachmentHeader(fileName),
    },
  });
}

/** Every НПП on the roster, one workbook each, zipped. ADMIN/EDITOR only. */
async function archive(user: { role: string }, year: number): Promise<Response> {
  if (user.role === 'USER') return new Response('Forbidden', { status: 403 });

  const staffList = (await db.staff.findMany({
    where: { ...ON_ROSTER, isNpp: true },
    select: STAFF_SELECT,
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  })) as ExportStaffRow[];

  const fullNames = staffList.map(fullNameOf);
  // Namesakes must not overwrite each other inside the archive
  const fileNames = personFileNames(fullNames, DOC_SUFFIX);

  // Two queries for everybody, not two per person — at ~300 НПП the per-person
  // path is ~600 round trips.
  const documents = await getKharakterystykaMany(
    staffList.map((s) => s.id),
    year
  );

  const zip = new JSZip();
  for (const [i, staff] of staffList.entries()) {
    const data = documents.get(staff.id);
    if (!data) continue;
    const wb = buildKharakterystykaWorkbook(
      {
        fullName: fullNames[i],
        department: staff.department?.name ?? '',
        academicTitle: titleOf(staff),
      },
      data
    );
    zip.file(fileNames[i], await wb.xlsx.writeBuffer());
  }

  const bytes = await zip.generateAsync({ type: 'uint8array' });

  return new Response(bytes as BodyInit, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="kharakterystyka-${year}.zip"`,
    },
  });
}
