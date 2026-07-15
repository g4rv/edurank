import JSZip from 'jszip';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { RATING_DIVISIONS, type RatingDivisionKey } from '@/lib/rating/activity-types';
import {
  buildRatingWorkbook,
  type ExportActivityType,
  type ExportStaffData,
} from '@/lib/rating/export-workbook';

// GET /api/export/ratings?year=2026 — zip with one official-form Excel
// workbook per НПП. The proxy does not cover /api, so auth lives here.
export async function GET(request: Request) {
  const session = await auth();
  if (!session || session.user.role === 'USER') {
    return new Response('Forbidden', { status: 403 });
  }

  const url = new URL(request.url);
  const yearParam = Number(url.searchParams.get('year'));

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
        coefficient: true,
        coefficientNote: true,
        verifyingDivisionId: true,
        section: { select: { number: true } },
      },
      orderBy: [{ section: { number: 'asc' } }, { order: 'asc' }],
    }),
    db.division.findMany({ select: { id: true, name: true } }),
    db.staff.findMany({
      where: { isNpp: true },
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
      where: { year: template.year, status: 'APPROVED' },
      select: {
        staffId: true,
        score: true,
        evidence: true,
        activityType: { select: { code: true } },
      },
    }),
  ]);

  // Division id → registry short key (sheet's «Дані внесені» column)
  const keyByDivisionId = new Map<string, RatingDivisionKey>();
  for (const division of divisions) {
    const entry = Object.entries(RATING_DIVISIONS).find(([, name]) => name === division.name);
    if (entry) keyByDivisionId.set(division.id, entry[0] as RatingDivisionKey);
  }

  const exportTypes: ExportActivityType[] = types.map((t) => ({
    code: t.code,
    label: t.label,
    coefficient: t.coefficient,
    coefficientNote: t.coefficientNote,
    sectionNumber: t.section.number,
    divisionKey: t.verifyingDivisionId
      ? (keyByDivisionId.get(t.verifyingDivisionId) ?? null)
      : null,
  }));

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

  const zip = new JSZip();
  for (const staff of staffList) {
    const fullName = `${staff.lastName} ${staff.firstName} ${staff.patronymic}`;
    const wb = buildRatingWorkbook(
      {
        fullName,
        department: staff.department?.name ?? '',
        year: template.year,
        activities: activitiesByStaff.get(staff.id) ?? [],
      },
      exportTypes
    );
    const buffer = await wb.xlsx.writeBuffer();
    // Windows-forbidden filename characters → space
    const safeName = fullName.replace(/[\\/:*?"<>|]/g, ' ').trim();
    zip.file(`${safeName}.xlsx`, buffer);
  }

  const archive = await zip.generateAsync({ type: 'uint8array' });

  return new Response(archive as BodyInit, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="rating-${template.year}.zip"`,
    },
  });
}
