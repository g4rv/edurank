import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { listStaff } from '@/lib/queries/list-staff';
import { attachmentHeader, personFileNames } from '@/lib/export/file-names';
import { fullStaffName } from '@/lib/staff-name';
import { parseStaffListParams, toStaffFilters } from '@/lib/staff/list-params';
import { canViewAnyQualifications } from '@/lib/qualifications/access';
import {
  buildQualificationsWorkbook,
  type QualificationExportPerson,
  type QualificationExportScope,
} from '@/lib/qualifications/export-workbook';
import { logError } from '@/lib/log';

// GET /api/export/qualifications            — everybody on the /staff list
// GET /api/export/qualifications?<the same query string /staff is showing>
// GET /api/export/qualifications?staffId=…  — one НПП, from their tab
//
// «Підвищення кваліфікації / Стажування» as one .xlsx (owner, 2026-10-13).
//
// **ADMIN, or an EDITOR whose division carries `canViewQualifications`** — the
// same people who may read the records on screen, and not the НПП themself: the
// button is not drawn for them and this refuses them too. The proxy does not
// cover /api, so the check lives here.
//
// The list mode reads the query string with `parseStaffListParams`, the reader
// /staff itself uses, so «the file is the people I was looking at» holds by
// construction (the same contract `/api/export/staff` keeps). Only НПП can have
// records, so an «Адміністративний» tab simply yields an empty sheet.
export async function GET(request: Request) {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });
  if (!(await canViewAnyQualifications(session.user))) {
    return new Response('Forbidden', { status: 403 });
  }

  try {
    const query = new URL(request.url).searchParams;
    const staffId = query.get('staffId');

    let people: PersonForExport[];
    let fileName: string;
    // How much of the person's place the list was not already narrowed to.
    let scope: QualificationExportScope = 'all';

    if (staffId) {
      const person = await db.staff.findUnique({
        where: { id: staffId },
        select: {
          id: true,
          isNpp: true,
          lastName: true,
          firstName: true,
          patronymic: true,
        },
      });
      // The same answer for «no such person» and «not an НПП»: there is nothing
      // to export either way.
      if (!person || !person.isNpp) return new Response('Not Found', { status: 404 });
      people = [person];
      fileName = personFileNames([fullStaffName(person)], 'Підвищення кваліфікації')[0];
    } else {
      const isAdmin = session.user.role === 'ADMIN';
      const params = parseStaffListParams(query, { isAdmin });
      const staff = await listStaff(toStaffFilters(params, { isAdmin }));
      people = staff.filter((p) => p.isNpp);
      scope = params.departmentId ? 'department' : params.facultyId ? 'faculty' : 'all';
      fileName = `Підвищення кваліфікації ${new Date().toISOString().slice(0, 10)}.xlsx`;
    }

    const records = await db.qualification.findMany({
      where: { staffId: { in: people.map((p) => p.id) } },
      orderBy: [{ issuedOn: 'desc' }, { createdAt: 'desc' }],
    });
    const byPerson = new Map<string, typeof records>();
    for (const record of records) {
      byPerson.set(record.staffId, [...(byPerson.get(record.staffId) ?? []), record]);
    }

    // Where each person works — the факультет of every кафедра they are on.
    const places = await db.staff.findMany({
      where: { id: { in: people.map((p) => p.id) } },
      select: {
        id: true,
        department: { select: { name: true, faculty: { select: { name: true } } } },
        partTimeDepartments: {
          select: { department: { select: { name: true, faculty: { select: { name: true } } } } },
        },
      },
    });
    const placeOf = new Map(places.map((p) => [p.id, p]));

    // People in the order the list had them; a person with no records has no
    // row. Each person's records are newest first.
    const rows: QualificationExportPerson[] = people.flatMap((person) => {
      const mine = byPerson.get(person.id) ?? [];
      if (mine.length === 0) return [];
      const place = placeOf.get(person.id);
      const departments = [
        ...(place?.department ? [place.department] : []),
        ...(place?.partTimeDepartments.map((p) => p.department) ?? []),
      ];
      return [
        {
          fullName: fullStaffName(person),
          faculties: [...new Set(departments.map((d) => d.faculty.name))],
          departments: departments.map((d) => d.name),
          records: mine.map((r) => ({
            kind: r.kind,
            institution: r.institution,
            documentType: r.documentType,
            series: r.series,
            number: r.number,
            url: r.url,
            topic: r.topic,
            issuedOn: r.issuedOn.toISOString().slice(0, 10),
            creditsHundredths: r.creditsHundredths,
          })),
        },
      ];
    });

    const buffer = await buildQualificationsWorkbook(rows, scope).xlsx.writeBuffer();

    return new Response(buffer as BodyInit, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': attachmentHeader(fileName),
      },
    });
  } catch (e) {
    // A download that fails silently looks like a browser problem and gets
    // reported as one, so the stack has to land somewhere.
    logError('export.qualifications', e, { userId: session.user.id });
    return new Response('Internal Server Error', { status: 500 });
  }
}

interface PersonForExport {
  id: string;
  lastName: string;
  firstName: string;
  patronymic: string;
}
