import JSZip from 'jszip';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { ON_ROSTER } from '@/lib/queries/roster';
import { canViewAcademicRecord } from '@/lib/queries/scope';
import { attachmentHeader } from '@/lib/export/file-names';
import type { RatingDivisionKey } from '@/lib/rating/activity-types';
import { evidenceFieldsSpecSchema } from '@/validations/activity-type-spec';
import {
  buildRatingWorkbook,
  ratingFileNames,
  type ExportActivityType,
  type ExportStaffData,
} from '@/lib/rating/export-workbook';

// GET /api/export/ratings?year=2026[&staffId=…] — the official per-teacher form.
//
//   with staffId — one .xlsx, for anybody entitled to read that person's record
//   without      — a zip of every НПП, ADMIN/EDITOR only
//
// The proxy does not cover /api, so auth lives here.
export async function GET(request: Request) {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });

  const url = new URL(request.url);
  // Read the raw param before converting: Number(null) is 0, and 0 is an
  // integer, so a missing year would look up the template for year zero and
  // 404 instead of falling back to the active one.
  const rawYear = url.searchParams.get('year');
  const yearParam = rawYear === null ? NaN : Number(rawYear);
  const staffId = url.searchParams.get('staffId');

  // One person's own form is theirs to download; the whole archive is not.
  // `canViewAcademicRecord` is the same rule the rating tab uses — ADMIN,
  // EDITOR, the завідувач of that person's кафедра, and the person themselves.
  if (staffId) {
    if (!(await canViewAcademicRecord(session.user, staffId))) {
      return new Response('Forbidden', { status: 403 });
    }
  } else if (session.user.role === 'USER') {
    return new Response('Forbidden', { status: 403 });
  }

  const template = Number.isInteger(yearParam)
    ? await db.ratingTemplate.findUnique({ where: { year: yearParam } })
    : await db.ratingTemplate.findFirst({ where: { isActive: true } });
  if (!template) return new Response('Not found', { status: 404 });

  const [types, divisions, staffList, activities] = await Promise.all([
    db.activityType.findMany({
      where: { templateId: template.id, isActive: true },
      select: {
        code: true,
        label: true,
        itemNumber: true,
        coefficient: true,
        coefficientNote: true,
        evidenceFields: true,
        verifyingDivisionId: true,
        section: { select: { number: true, title: true } },
      },
      orderBy: [{ section: { number: 'asc' } }, { order: 'asc' }],
    }),
    db.division.findMany({ select: { id: true, registryKey: true } }),
    db.staff.findMany({
      // One person by id, or the whole roster. An archived person still has a
      // form of their own — their history is intact and downloading it is how
      // somebody answers a question about a year they were here for — but they
      // are off the roster and out of the archive.
      where: staffId ? { id: staffId, isNpp: true } : { ...ON_ROSTER, isNpp: true },
      select: {
        id: true,
        lastName: true,
        firstName: true,
        patronymic: true,
        department: { select: { name: true } },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    }),
    db.activity.findMany({
      where: {
        year: template.year,
        status: 'APPROVED',
        ...(staffId ? { staffId } : {}),
      },
      select: {
        staffId: true,
        score: true,
        evidence: true,
        activityType: { select: { code: true } },
      },
    }),
  ]);

  // Division id → registry short key (sheet's «Дані внесені» column).
  // The key is a column on the row; matching the division's display name here
  // meant an admin renaming it on /divisions blanked the column with no sign.
  const keyByDivisionId = new Map<string, RatingDivisionKey>();
  for (const division of divisions) {
    if (division.registryKey) {
      keyByDivisionId.set(division.id, division.registryKey as RatingDivisionKey);
    }
  }

  const exportTypes: ExportActivityType[] = types.map((t) => {
    const fields = evidenceFieldsSpecSchema.safeParse(t.evidenceFields);
    return {
      code: t.code,
      label: t.label,
      itemNumber: t.itemNumber,
      coefficient: t.coefficient,
      coefficientNote: t.coefficientNote,
      sectionNumber: t.section.number,
      sectionTitle: t.section.title,
      fields: fields.success ? fields.data : [],
      divisionKey: t.verifyingDivisionId
        ? (keyByDivisionId.get(t.verifyingDivisionId) ?? null)
        : null,
    };
  });

  const activitiesByStaff = new Map<string, ExportStaffData['activities']>();
  for (const a of activities) {
    const evidence = a.evidence as Record<string, unknown> | null;
    const option =
      typeof evidence?.option === 'string'
        ? evidence.option
        : typeof evidence?.mode === 'string'
          ? evidence.mode
          : null;
    const list = activitiesByStaff.get(a.staffId) ?? [];
    list.push({ code: a.activityType.code, score: a.score, option });
    activitiesByStaff.set(a.staffId, list);
  }

  const fullNames = staffList.map((s) => `${s.lastName} ${s.firstName} ${s.patronymic}`);
  // Namesakes must not overwrite each other inside the archive
  const fileNames = ratingFileNames(fullNames);

  // A single person gets the workbook itself. Wrapping one file in a zip is a
  // step the reader has to undo before they can look at it.
  if (staffId) {
    const staff = staffList[0];
    if (!staff) return new Response('Not found', { status: 404 });

    const wb = buildRatingWorkbook(
      {
        fullName: fullNames[0],
        department: staff.department?.name ?? '',
        year: template.year,
        activities: activitiesByStaff.get(staff.id) ?? [],
      },
      exportTypes
    );

    return new Response((await wb.xlsx.writeBuffer()) as BodyInit, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': attachmentHeader(fileNames[0]),
      },
    });
  }

  const zip = new JSZip();
  for (const [i, staff] of staffList.entries()) {
    const wb = buildRatingWorkbook(
      {
        fullName: fullNames[i],
        department: staff.department?.name ?? '',
        year: template.year,
        activities: activitiesByStaff.get(staff.id) ?? [],
      },
      exportTypes
    );
    zip.file(fileNames[i], await wb.xlsx.writeBuffer());
  }

  const archive = await zip.generateAsync({ type: 'uint8array' });

  return new Response(archive as BodyInit, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="rating-${template.year}.zip"`,
    },
  });
}
